import { useMDXComponents as getDocsMDXComponents } from 'nextra-theme-docs'
import type { MDXComponentsInput } from './app/types/index'

const docsComponents = getDocsMDXComponents()

export const useMDXComponents = (components?: MDXComponentsInput) => ({
  ...docsComponents,
  ...(components || {}),
})
