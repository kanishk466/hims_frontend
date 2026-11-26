import { Image, Skeleton } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import QRCode from 'qrcode'

/** QR code image for a text (UPI payment link, UHID). Generated in the browser. */
export function QrCode({ value, size = 160, label }: { value: string; size?: number; label: string }) {
  const { data } = useQuery({ queryKey: ['qr', value, size], queryFn: () => QRCode.toDataURL(value, { width: size * 2, margin: 1 }), staleTime: Infinity })
  return data ? <Image src={data} w={size} h={size} alt={label} /> : <Skeleton w={size} h={size} />
}
