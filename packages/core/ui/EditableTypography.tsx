import React, { useEffect, useState } from 'react'
import { InputBase, Typography, TypographyProps, useTheme } from '@mui/material'
import { makeStyles } from 'tss-react/mui'

type Variant = TypographyProps['variant']

type EditableTypographyClassKey =
  | 'input'
  | 'inputBase'
  | 'inputRoot'
  | 'inputFocused'

const useStyles = makeStyles()(theme => ({
  input: {},
  inputBase: {},
  typography: {
    top: 6,
    left: 2,
    position: 'absolute',
    whiteSpace: 'nowrap',
    visibility: 'hidden',
  },
  inputRoot: {
    padding: theme.spacing(0.5),
  },
  inputFocused: {
    borderStyle: 'solid',
    borderWidth: 2,
  },
}))

interface Props {
  value: string
  setValue: (value: string) => void
  variant: Variant
  classes?: Partial<Record<EditableTypographyClassKey, string>>
}

// using forwardRef so that MUI Tooltip can wrap this component
const EditableTypography = React.forwardRef<HTMLDivElement, Props>(
  (props, ref) => {
    const { value, setValue, variant, ...other } = props
    const [editedValue, setEditedValue] = useState<string>()
    const [sizerNode, setSizerNode] = useState<HTMLSpanElement | null>(null)
    const [inputNode, setInputNode] = useState<HTMLInputElement | null>(null)
    const [blur, setBlur] = useState(false)

    useEffect(() => {
      if (blur) {
        inputNode?.blur()
        setBlur(false)
      }
    }, [blur, inputNode])

    // possibly tss-react does not understand the passing of props to
    // useStyles, but it appears to work
    // @ts-expect-error
    const { classes } = useStyles(props, { props })
    const theme = useTheme()

    const clientWidth = sizerNode?.clientWidth
    const width = clientWidth || 0

    const val = editedValue === undefined ? value : editedValue

    return (
      <div {...other} ref={ref}>
        <div style={{ position: 'relative' }}>
          <Typography
            ref={(node: HTMLSpanElement) => setSizerNode(node)}
            component="span"
            variant={variant}
            className={classes.typography}
          >
            {val}
          </Typography>
        </div>
        <InputBase
          inputRef={node => setInputNode(node)}
          className={classes.inputBase}
          inputProps={{
            style: {
              width,
              ...(variant && variant !== 'inherit'
                ? theme.typography[variant]
                : {}),
            },
          }}
          classes={{
            input: classes.input,
            root: classes.inputRoot,
            focused: classes.inputFocused,
          }}
          value={val}
          onChange={event => setEditedValue(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              inputNode?.blur()
            } else if (event.key === 'Escape') {
              setEditedValue(undefined)
              setBlur(true)
            }
          }}
          onBlur={() => {
            setValue(editedValue || value || '')
            setEditedValue(undefined)
          }}
        />
      </div>
    )
  },
)

export default EditableTypography
