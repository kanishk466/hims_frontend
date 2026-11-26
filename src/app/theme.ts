import { createTheme } from '@mantine/core'

export const theme = createTheme({
  primaryColor: 'teal',
  defaultRadius: 'md',
  fontFamily: 'Inter, "Segoe UI", system-ui, -apple-system, Roboto, sans-serif',
  headings: { fontWeight: '650' },
  components: {
    Button: { defaultProps: { size: 'sm' } },
    TextInput: { defaultProps: { size: 'sm' } },
  },
})
