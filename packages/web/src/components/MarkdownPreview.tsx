import { memo, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { cn } from '../lib/utils'

interface MarkdownPreviewProps {
  content: string
  className?: string
}

export const MarkdownPreview = memo(function MarkdownPreview({
  content,
  className
}: MarkdownPreviewProps) {
  const remarkPlugins = useMemo(() => [remarkGfm], [])
  const rehypePlugins = useMemo(() => [rehypeHighlight], [])

  return (
    <div className={cn('markdown-preview', className)}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
})
