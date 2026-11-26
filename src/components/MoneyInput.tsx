import { NumberInput, type NumberInputProps } from '@mantine/core'
import type { Paise } from '@/types/common'

interface MoneyInputProps extends Omit<NumberInputProps, 'value' | 'onChange' | 'defaultValue'> {
  /** Amount in integer paise. */
  value: Paise | undefined | null
  onChange: (paise: Paise | undefined) => void
}

/** Rupee input that stores integer paise. Shows ₹ and Indian digit grouping (1,25,000). */
export function MoneyInput({ value, onChange, ...rest }: MoneyInputProps) {
  return (
    <NumberInput
      prefix="₹ "
      thousandSeparator=","
      thousandsGroupStyle="lakh"
      decimalScale={2}
      allowNegative={false}
      hideControls
      value={value == null ? '' : value / 100}
      onChange={(v) => onChange(v === '' || v == null ? undefined : Math.round(Number(v) * 100))}
      {...rest}
    />
  )
}
