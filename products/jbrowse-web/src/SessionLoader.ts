import { types, addDisposer, Instance, SnapshotOut } from 'mobx-state-tree'
import { autorun } from 'mobx'
import PluginManager from '@jbrowse/core/PluginManager'
import PluginLoader, {
  PluginDefinition,
  PluginRecord,
  isUMDPluginDefinition,
  isCJSPluginDefinition,
  isESMPluginDefinition,
} from '@jbrowse/core/PluginLoader'
import { fromUrlSafeB64 } from './util'
import { readSessionFromDynamo } from './sessionSharing'
import { openLocation } from '@jbrowse/core/util/io'
import { AnyConfigurationModel } from '@jbrowse/core/configuration'
import shortid from 'shortid'

type Config = SnapshotOut<AnyConfigurationModel>

function addRelativeUris(config: Config, base: URL) {
  if (typeof config === 'object') {
    for (const key of Object.keys(config)) {
      if (typeof config[key] === 'object') {
        addRelativeUris(config[key], base)
      } else if (key === 'uri') {
        config.baseUri = base.href
      }
    }
  }
}

type Root = { configuration?: Config }

// raw readConf alternative for before conf is initialized
function readConf({ configuration }: Root, attr: string, def: string) {
  return configuration?.[attr] || def
}

async function fetchPlugins() {
  const response = await fetch('https://jbrowse.org/plugin-store/plugins.json')
  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} ${response.statusText} fetching plugins`,
    )
  }
  return response.json() as Promise<{ plugins: PluginDefinition[] }>
}

async function checkPlugins(pluginsToCheck: PluginDefinition[]) {
  if (pluginsToCheck.length === 0) {
    return true
  }
  const storePlugins = await fetchPlugins()
  return pluginsToCheck.every(p => {
    if (isUMDPluginDefinition(p)) {
      return storePlugins.plugins.some(
        pp =>
          isUMDPluginDefinition(p) &&
          (('url' in pp && 'url' in p && p.url === pp.url) ||
            ('umdUrl' in pp && 'umdUrl' in p && p.umdUrl === pp.umdUrl)),
      )
    }
    if (isESMPluginDefinition(p)) {
      return storePlugins.plugins.some(
        pp =>
          isESMPluginDefinition(p) && 'esmUrl' in p && p.esmUrl === pp.esmUrl,
      )
    }
    if (isCJSPluginDefinition(p)) {
      return storePlugins.plugins.some(
        pp => isCJSPluginDefinition(p) && p.cjsUrl === pp.cjsUrl,
      )
    }
    return false
  })
}

const SessionLoader = types
  .model({
    configPath: types.maybe(types.string),
    sessionQuery: types.maybe(types.string),
    password: types.maybe(types.string),
    adminKey: types.maybe(types.string),
    loc: types.maybe(types.string),
    sessionTracks: types.maybe(types.string),
    assembly: types.maybe(types.string),
    tracks: types.maybe(types.string),
  })
  .volatile(() => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any,
    blankSession: false as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any,
    sessionTriaged: undefined as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any,
    shareWarningOpen: false as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any,
    configSnapshot: undefined as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any,
    sessionSnapshot: undefined as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any,
    sessionSpec: undefined as any,
    runtimePlugins: [] as PluginRecord[],
    sessionPlugins: [] as PluginRecord[],
    sessionError: undefined as unknown,
    configError: undefined as unknown,
    bc1:
      window.BroadcastChannel &&
      new window.BroadcastChannel('jb_request_session'),
    bc2:
      window.BroadcastChannel &&
      new window.BroadcastChannel('jb_respond_session'),
  }))
  .views(self => ({
    get isSharedSession() {
      return !!self.sessionQuery?.startsWith('share-')
    },

    get isSpecSession() {
      return !!self.sessionQuery?.startsWith('spec-')
    },

    get isJb1StyleSession() {
      return !!self.loc
    },

    get isEncodedSession() {
      return !!self.sessionQuery?.startsWith('encoded-')
    },

    get isJsonSession() {
      return !!self.sessionQuery?.startsWith('json-')
    },

    get isLocalSession() {
      return !!self.sessionQuery?.startsWith('local-')
    },

    get ready() {
      return Boolean(this.isSessionLoaded && !self.configError)
    },

    get error() {
      return self.configError || self.sessionError
    },

    get isSessionLoaded() {
      return Boolean(
        self.sessionError ||
          self.sessionSnapshot ||
          self.blankSession ||
          self.sessionSpec,
      )
    },
    get isConfigLoaded() {
      return Boolean(self.configError || self.configSnapshot)
    },

    get sessionTracksParsed() {
      return self.sessionTracks ? JSON.parse(self.sessionTracks) : []
    },
  }))
  .actions(self => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any,
    setSessionQuery(session?: any) {
      self.sessionQuery = session
    },
    setConfigError(error: unknown) {
      self.configError = error
    },
    setSessionError(error: unknown) {
      self.sessionError = error
    },
    setRuntimePlugins(plugins: PluginRecord[]) {
      self.runtimePlugins = plugins
    },
    setSessionPlugins(plugins: PluginRecord[]) {
      self.sessionPlugins = plugins
    },
    setConfigSnapshot(snap: unknown) {
      self.configSnapshot = snap
    },

    setBlankSession(flag: boolean) {
      self.blankSession = flag
    },
    setSessionTriaged(args?: {
      snap: unknown
      origin: string
      reason: { url?: string }[]
    }) {
      self.sessionTriaged = args
    },
    setSessionSnapshotSuccess(snap: unknown) {
      self.sessionSnapshot = snap
    },
  }))
  .actions(self => ({
    async fetchPlugins(config: { plugins: PluginDefinition[] }) {
      try {
        const pluginLoader = new PluginLoader(config.plugins, {
          fetchESM: url => import(/* webpackIgnore:true */ url),
        })
        pluginLoader.installGlobalReExports(window)
        const runtimePlugins = await pluginLoader.load(window.location.href)
        self.setRuntimePlugins([...runtimePlugins])
      } catch (e) {
        console.error(e)
        self.setConfigError(e)
      }
    },
    async fetchSessionPlugins(snap: { sessionPlugins?: PluginDefinition[] }) {
      try {
        const pluginLoader = new PluginLoader(snap.sessionPlugins || [], {
          fetchESM: url => import(/* webpackIgnore:true */ url),
        })
        pluginLoader.installGlobalReExports(window)
        const plugins = await pluginLoader.load(window.location.href)
        self.setSessionPlugins([...plugins])
      } catch (e) {
        console.error(e)
        self.setConfigError(e)
      }
    },

    // passed
    async setSessionSnapshot(
      snap: { sessionPlugins?: PluginDefinition[]; id: string },
      userAcceptedConfirmation?: boolean,
    ) {
      try {
        const { sessionPlugins = [] } = snap
        const sessionPluginsAllowed = await checkPlugins(sessionPlugins)
        if (sessionPluginsAllowed || userAcceptedConfirmation) {
          await this.fetchSessionPlugins(snap)
          self.setSessionSnapshotSuccess(snap)
        } else {
          self.setSessionTriaged({
            snap,
            origin: 'session',
            reason: sessionPlugins,
          })
        }
      } catch (e) {
        console.error(e)
        self.setConfigError(e)
      }
    },

    async fetchConfig() {
      let { configPath = 'config.json' } = self

      // @ts-expect-error
      // eslint-disable-next-line no-underscore-dangle
      if (window.__jbrowseCacheBuster) {
        configPath += `?rand=${Math.random()}`
      }

      const text = await openLocation({
        uri: configPath,
        locationType: 'UriLocation',
      }).readFile('utf8')
      const config = JSON.parse(text)
      const configUri = new URL(configPath, window.location.href)
      addRelativeUris(config, configUri)

      // cross origin config check
      if (configUri.hostname !== window.location.hostname) {
        const configPlugins = config.plugins || []
        const configPluginsAllowed = await checkPlugins(configPlugins)
        if (!configPluginsAllowed) {
          return self.setSessionTriaged({
            snap: config,
            origin: 'config',
            reason: configPlugins,
          })
        }
      }
      await this.fetchPlugins(config)
      self.setConfigSnapshot(config)
    },

    async fetchSessionStorageSession() {
      const sessionStr = sessionStorage.getItem('current')
      const query = (self.sessionQuery as string).replace('local-', '')

      // check if
      if (sessionStr) {
        const sessionSnap = JSON.parse(sessionStr).session || {}
        if (query === sessionSnap.id) {
          return this.setSessionSnapshot(sessionSnap)
        }
      }

      if (self.bc1) {
        self.bc1.postMessage(query)
        try {
          const result = await new Promise<Record<string, unknown>>(
            (resolve, reject) => {
              if (self.bc2) {
                self.bc2.onmessage = msg => {
                  resolve(msg.data)
                }
              }
              setTimeout(() => reject(), 1000)
            },
          )
          return this.setSessionSnapshot({ ...result, id: shortid() })
        } catch (e) {
          // the broadcast channels did not find the session in another tab
          // clear session param, so just ignore
        }
      }
      throw new Error('Local storage session not found')
    },

    async fetchSharedSession() {
      const defaultURL = 'https://share.jbrowse.org/api/v1/'
      const decryptedSession = await readSessionFromDynamo(
        `${readConf(self.configSnapshot, 'shareURL', defaultURL)}load`,
        self.sessionQuery || '',
        self.password || '',
      )

      const session = JSON.parse(await fromUrlSafeB64(decryptedSession))
      await this.setSessionSnapshot({ ...session, id: shortid() })
    },

    async decodeEncodedUrlSession() {
      const session = JSON.parse(
        // @ts-expect-error
        await fromUrlSafeB64(self.sessionQuery.replace('encoded-', '')),
      )
      await this.setSessionSnapshot({ ...session, id: shortid() })
    },

    decodeSessionSpec() {
      if (!self.sessionQuery) {
        return
      }
      self.sessionSpec = JSON.parse(self.sessionQuery.replace('spec-', ''))
    },

    decodeJb1StyleSession() {
      const { loc, tracks, assembly, sessionTracksParsed: sessionTracks } = self
      if (loc) {
        self.sessionSpec = {
          sessionTracks,
          views: [
            {
              type: 'LinearGenomeView',
              tracks: tracks?.split(','),
              sessionTracks,
              loc,
              assembly,
            },
          ],
        }
      }
    },

    async decodeJsonUrlSession() {
      // @ts-expect-error
      const session = JSON.parse(self.sessionQuery.replace('json-', ''))
      await this.setSessionSnapshot({ ...session.session, id: shortid() })
    },

    async afterCreate() {
      try {
        // rename the current autosave from previously loaded jbrowse session
        // into previousAutosave on load
        const { configPath } = self
        const lastAutosave = localStorage.getItem(`autosave-${configPath}`)
        if (lastAutosave) {
          localStorage.setItem(`previousAutosave-${configPath}`, lastAutosave)
        }
      } catch (e) {
        console.error('failed to create previousAutosave', e)
      }

      try {
        // fetch config
        await this.fetchConfig()
      } catch (e) {
        console.error(e)
        self.setConfigError(e)
        return
      }

      addDisposer(
        self,
        autorun(async () => {
          try {
            const {
              isLocalSession,
              isEncodedSession,
              isSpecSession,
              isSharedSession,
              isJsonSession,
              isJb1StyleSession,
              sessionQuery,
              configSnapshot,
            } = self
            if (!configSnapshot) {
              return
            }

            if (self.bc1) {
              self.bc1.onmessage = msg => {
                const r =
                  JSON.parse(sessionStorage.getItem('current') || '{}')
                    .session || {}
                if (r.id === msg.data && self.bc2) {
                  self.bc2.postMessage(r)
                }
              }
            }

            if (isSharedSession) {
              await this.fetchSharedSession()
            } else if (isSpecSession) {
              this.decodeSessionSpec()
            } else if (isJb1StyleSession) {
              this.decodeJb1StyleSession()
            } else if (isEncodedSession) {
              await this.decodeEncodedUrlSession()
            } else if (isJsonSession) {
              await this.decodeJsonUrlSession()
            } else if (isLocalSession) {
              await this.fetchSessionStorageSession()
            } else if (sessionQuery) {
              // if there was a sessionQuery and we don't recognize it
              throw new Error('unrecognized session format')
            } else {
              // placeholder for session loaded, but none found
              self.setBlankSession(true)
            }
          } catch (e) {
            console.error(e)
            self.setSessionError(e)
          }
        }),
      )
    },
  }))

export type SessionLoaderModel = Instance<typeof SessionLoader>

export default SessionLoader

interface ViewSpec {
  type: string
  tracks?: string[]
  assembly: string
  loc: string
}

// use extension point named e.g. LaunchView-LinearGenomeView to initialize an
// LGV session
export function loadSessionSpec(
  {
    views,
    sessionTracks = [],
  }: {
    views: ViewSpec[]
    sessionTracks: unknown[]
  },
  pluginManager: PluginManager,
) {
  return async () => {
    const { rootModel } = pluginManager
    if (!rootModel) {
      throw new Error('rootModel not initialized')
    }
    try {
      // @ts-expect-error
      rootModel.setSession({
        name: `New session ${new Date().toLocaleString()}`,
      })

      // @ts-expect-error
      sessionTracks.forEach(track => rootModel.session.addTrackConf(track))

      await Promise.all(
        views.map(view =>
          pluginManager.evaluateAsyncExtensionPoint('LaunchView-' + view.type, {
            ...view,
            session: rootModel.session,
          }),
        ),
      )
    } catch (e) {
      console.error(e)
      rootModel.session?.notify(`${e}`)
    }
  }
}
