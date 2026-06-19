import dynamic from 'next/dynamic'

type ProvinceMapOlProps = {
  selectedProvince: string
}

const ProvinceMapOlClient = dynamic(() => import('./ProvinceMapOlClient'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-xl bg-teal-50" />,
})

export default function ProvinceMapOl(props: ProvinceMapOlProps) {
  return <ProvinceMapOlClient {...props} />
}
