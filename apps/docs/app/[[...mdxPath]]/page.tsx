import { generateStaticParamsFor, importPage } from 'nextra/pages'
import { useMDXComponents as getMDXComponents } from '../../mdx-components'
import type { PageProps, Metadata, MDXWrapperProps } from '../types/index'

export const generateStaticParams = generateStaticParamsFor('mdxPath')

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = await props.params
  const { metadata } = await importPage(params.mdxPath)
  return metadata
}

const WrapperComponent = getMDXComponents().wrapper as React.ComponentType<MDXWrapperProps>

export default async function Page(props: PageProps) {
  const params = await props.params
  const { default: MDXContent, toc, metadata } = await importPage(params.mdxPath)
  return (
    <WrapperComponent toc={toc} metadata={metadata} sourceCode="">
      <MDXContent {...props} params={params} />
    </WrapperComponent>
  )
}
