import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export interface DocsLayoutProps {
  children: ReactNode
}

export interface PageProps {
  params: Promise<{ mdxPath: string[] }>
}

export interface MDXComponentsInput {
  [key: string]: any
}

export interface MDXWrapperProps {
  toc: any
  metadata: any
  sourceCode?: string
  children: any
  [key: string]: any
}

export type { Metadata }
