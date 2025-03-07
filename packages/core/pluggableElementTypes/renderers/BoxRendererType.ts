import deepEqual from 'fast-deep-equal'

// layouts
import GranularRectLayout from '../../util/layouts/GranularRectLayout'
import MultiLayout from '../../util/layouts/MultiLayout'
import { SerializedLayout, BaseLayout } from '../../util/layouts/BaseLayout'
import PrecomputedLayout from '../../util/layouts/PrecomputedLayout'

// other
import FeatureRendererType, {
  RenderArgs as FeatureRenderArgs,
  RenderArgsSerialized as FeatureRenderArgsSerialized,
  RenderArgsDeserialized as FeatureRenderArgsDeserialized,
  RenderResults as FeatureRenderResults,
  ResultsSerialized as FeatureResultsSerialized,
  ResultsDeserialized as FeatureResultsDeserialized,
} from './FeatureRendererType'
import { getLayoutId, Region, Feature } from '../../util'
import { readConfObject, AnyConfigurationModel } from '../../configuration'
import SerializableFilterChain from './util/serializableFilterChain'
import RpcManager from '../../rpc/RpcManager'

export interface LayoutSessionProps {
  config: AnyConfigurationModel
  bpPerPx: number
  filters: SerializableFilterChain
}

export type MyMultiLayout = MultiLayout<GranularRectLayout<unknown>, unknown>
export interface CachedLayout {
  layout: MyMultiLayout
  config: AnyConfigurationModel
  filters: SerializableFilterChain
}

export class LayoutSession implements LayoutSessionProps {
  config: AnyConfigurationModel

  bpPerPx: number

  filters: SerializableFilterChain

  constructor(args: LayoutSessionProps) {
    this.config = args.config
    this.bpPerPx = args.bpPerPx
    this.filters = args.filters
    this.update(args)
  }

  update(props: LayoutSessionProps) {
    Object.assign(this, props)
  }

  makeLayout() {
    return new MultiLayout(GranularRectLayout, {
      maxHeight: readConfObject(this.config, 'maxHeight'),
      displayMode: readConfObject(this.config, 'displayMode'),
      pitchX: this.bpPerPx,
      pitchY: readConfObject(this.config, 'noSpacing') ? 1 : 3,
    })
  }

  /**
   * @param layout -
   * @returns true if the given layout is a valid one to use for this session
   */
  cachedLayoutIsValid(cachedLayout: CachedLayout) {
    return (
      cachedLayout &&
      cachedLayout.layout.subLayoutConstructorArgs.pitchX === this.bpPerPx &&
      deepEqual(readConfObject(this.config), cachedLayout.config) &&
      deepEqual(this.filters, cachedLayout.filters)
    )
  }

  cachedLayout: CachedLayout | undefined

  get layout(): MyMultiLayout {
    if (!this.cachedLayout || !this.cachedLayoutIsValid(this.cachedLayout)) {
      this.cachedLayout = {
        layout: this.makeLayout(),
        config: readConfObject(this.config),
        filters: this.filters,
      }
    }
    return this.cachedLayout.layout
  }
}
export interface RenderArgs extends FeatureRenderArgs {
  bpPerPx: number
  layoutId: string
}

export interface RenderArgsSerialized extends FeatureRenderArgsSerialized {
  bpPerPx: number
}

export interface RenderArgsDeserialized extends FeatureRenderArgsDeserialized {
  bpPerPx: number
  layoutId: string
}

export interface RenderResults extends FeatureRenderResults {
  layout: BaseLayout<Feature>
}

export interface ResultsSerialized extends FeatureResultsSerialized {
  maxHeightReached: boolean
  layout: SerializedLayout
}

export interface ResultsDeserialized extends FeatureResultsDeserialized {
  maxHeightReached: boolean
  layout: PrecomputedLayout<string>
}

export default class BoxRendererType extends FeatureRendererType {
  sessions: { [key: string]: LayoutSession } = {}

  getWorkerSession(
    props: LayoutSessionProps & { sessionId: string; layoutId: string },
  ) {
    const key = getLayoutId(props)
    if (!this.sessions[key]) {
      this.sessions[key] = this.createSession(props)
    }
    const session = this.sessions[key]
    session.update(props)
    return session
  }

  // expands region for glyphs to use
  getExpandedRegion(region: Region, renderArgs: RenderArgsDeserialized) {
    if (!region) {
      return region
    }
    const { bpPerPx, config } = renderArgs
    const maxFeatureGlyphExpansion =
      config === undefined
        ? 0
        : readConfObject(config, 'maxFeatureGlyphExpansion')
    if (!maxFeatureGlyphExpansion) {
      return region
    }
    const bpExpansion = Math.round(maxFeatureGlyphExpansion * bpPerPx)
    return {
      ...region,
      start: Math.floor(Math.max(region.start - bpExpansion, 0)),
      end: Math.ceil(region.end + bpExpansion),
    }
  }

  createSession(props: LayoutSessionProps) {
    return new LayoutSession(props)
  }

  async freeResourcesInClient(rpcManager: RpcManager, args: RenderArgs) {
    const { regions } = args
    const key = getLayoutId(args)
    let freed = 0
    const session = this.sessions[key]
    if (!regions && session) {
      delete this.sessions[key]
      freed = 1
    }
    if (session && regions) {
      session.layout.discardRange(
        regions[0].refName,
        regions[0].start,
        regions[0].end,
      )
    }
    return freed + (await super.freeResourcesInClient(rpcManager, args))
  }

  deserializeLayoutInClient(json: SerializedLayout) {
    return new PrecomputedLayout(json)
  }

  deserializeResultsInClient(result: ResultsSerialized, args: RenderArgs) {
    const layout = this.deserializeLayoutInClient(result.layout)
    return super.deserializeResultsInClient(
      { ...result, layout } as FeatureResultsSerialized,
      args,
    ) as ResultsDeserialized
  }

  createLayoutInWorker(args: RenderArgsDeserialized) {
    const { regions } = args
    const session = this.getWorkerSession(args)
    const subLayout = session.layout.getSublayout(regions[0].refName)
    return subLayout
  }

  serializeResultsInWorker(
    results: RenderResults,
    args: RenderArgsDeserialized,
  ): ResultsSerialized {
    const serialized = super.serializeResultsInWorker(
      results,
      args,
    ) as ResultsSerialized

    const [region] = args.regions
    serialized.layout = results.layout.serializeRegion(
      this.getExpandedRegion(region, args),
    )
    if (serialized.layout.rectangles) {
      serialized.features = serialized.features.filter(f => {
        return Boolean(serialized.layout.rectangles[f.uniqueId])
      })
    }

    serialized.maxHeightReached = serialized.layout.maxHeightReached
    return serialized
  }

  /**
   * gets layout and renders
   *
   * @param props - render args
   */
  async render(props: RenderArgsDeserialized): Promise<RenderResults> {
    const layout =
      (props.layout as undefined | BaseLayout<unknown>) ||
      this.createLayoutInWorker(props)
    const result = await super.render({ ...props, layout })
    return { ...result, layout }
  }
}
