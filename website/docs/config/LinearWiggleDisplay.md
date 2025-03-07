---
id: linearwiggledisplay
title: LinearWiggleDisplay
toplevel: true
---

Note: this document is automatically generated from configuration objects in our
source code. See [Config guide](/docs/config_guide) for more info

## Source file

[plugins/wiggle/src/LinearWiggleDisplay/models/configSchema.ts](https://github.com/GMOD/jbrowse-components/blob/main/plugins/wiggle/src/LinearWiggleDisplay/models/configSchema.ts)

## Docs

### LinearWiggleDisplay - Slots

#### slot: autoscale

```js
autoscale: {
        type: 'stringEnum',
        defaultValue: 'local',
        model: types.enumeration('Autoscale type', [
          'global',
          'local',
          'globalsd',
          'localsd',
          'zscore',
        ]),
        description:
          'global/local using their min/max values or w/ standard deviations (globalsd/localsd)',
      }
```

#### slot: minimalTicks

```js
minimalTicks: {
        type: 'boolean',
        defaultValue: false,
        description: 'use the minimal amount of ticks',
      }
```

#### slot: minScore

```js
minScore: {
        type: 'number',
        defaultValue: Number.MIN_VALUE,
        description: 'minimum value for the y-scale',
      }
```

#### slot: maxScore

```js
maxScore: {
        type: 'number',
        description: 'maximum value for the y-scale',
        defaultValue: Number.MAX_VALUE,
      }
```

#### slot: numStdDev

```js
numStdDev: {
        type: 'number',
        description:
          'number of standard deviations to use for autoscale types globalsd or localsd',
        defaultValue: 3,
      }
```

#### slot: scaleType

```js
scaleType: {
        type: 'stringEnum',
        model: types.enumeration('Scale type', ['linear', 'log']),
        description: 'The type of scale to use',
        defaultValue: 'linear',
      }
```

#### slot: inverted

```js
inverted: {
        type: 'boolean',
        description: 'draw upside down',
        defaultValue: false,
      }
```

#### slot: defaultRendering

```js
defaultRendering: {
        type: 'stringEnum',
        model: types.enumeration('Rendering', ['density', 'xyplot', 'line']),
        defaultValue: 'xyplot',
      }
```

#### slot: renderers

```js
renderers: ConfigurationSchema('RenderersConfiguration', {
  DensityRenderer: DensityRendererConfigSchema,
  XYPlotRenderer: XYPlotRendererConfigSchema,
  LinePlotRenderer: LinePlotRendererConfigSchema,
})
```

## LinearWiggleDisplay - Derives from

```js
baseConfiguration: baseLinearDisplayConfigSchema
```
