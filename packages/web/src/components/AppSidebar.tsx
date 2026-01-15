import * as React from 'react'
import { memo, useMemo } from 'react'
import { ChevronDown, File, Folder } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from './ui/collapsible'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarRail,
  SidebarHeader,
} from './ui/sidebar'
import { cn } from '../lib/utils'

interface FileDiffInfo {
  path: string
  status: 'added' | 'deleted' | 'modified' | 'renamed' | 'untracked'
  additions: number
  deletions: number
}

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  files: FileDiffInfo[]
  selectedFile: string | null
  onSelectFile: (path: string) => void
  title?: string
  loading?: boolean
  headerContent?: React.ReactNode
}

const statusBadge: Record<string, { label: string; className: string }> = {
  added: { label: 'A', className: 'text-emerald-500' },
  deleted: { label: 'D', className: 'text-red-400' },
  modified: { label: 'M', className: 'text-amber-400' },
  renamed: { label: 'R', className: 'text-blue-400' },
  untracked: { label: 'U', className: 'text-purple-400' },
}

// Build tree structure from flat file paths
interface TreeNode {
  name: string
  path: string
  isFile: boolean
  status?: 'added' | 'deleted' | 'modified' | 'renamed' | 'untracked'
  additions?: number
  deletions?: number
  children: Map<string, TreeNode>
}

function buildTree(files: FileDiffInfo[]): TreeNode {
  const root: TreeNode = {
    name: '',
    path: '',
    isFile: false,
    children: new Map(),
  }

  for (const file of files) {
    const parts = file.path.split('/')
    let current = root

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isFile = i === parts.length - 1
      const path = parts.slice(0, i + 1).join('/')

      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          path,
          isFile,
          status: isFile ? file.status : undefined,
          additions: isFile ? file.additions : undefined,
          deletions: isFile ? file.deletions : undefined,
          children: new Map(),
        })
      }
      current = current.children.get(part)!
    }
  }

  return root
}

// Recursive tree component
function TreeItem({
  node,
  selectedFile,
  onSelectFile,
  defaultOpen = false,
}: {
  node: TreeNode
  selectedFile: string | null
  onSelectFile: (path: string) => void
  defaultOpen?: boolean
}) {
  if (node.isFile) {
    const badge = statusBadge[node.status || 'modified']
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          isActive={selectedFile === node.path}
          onClick={() => onSelectFile(node.path)}
          className="text-xs"
        >
          <File className="size-3 shrink-0" />
          <span className="whitespace-nowrap">{node.name}</span>
        </SidebarMenuButton>
        <SidebarMenuBadge className={cn('font-mono text-[10px]', badge.className)}>
          {badge.label}
        </SidebarMenuBadge>
      </SidebarMenuItem>
    )
  }

  const children = Array.from(node.children.values()).sort((a, b) => {
    // Folders first, then files
    if (a.isFile !== b.isFile) return a.isFile ? 1 : -1
    return a.name.localeCompare(b.name)
  })

  return (
    <SidebarMenuItem>
      <Collapsible
        className="group/collapsible [&[data-state=open]>button>svg:first-child]:rotate-180"
        defaultOpen={defaultOpen}
      >
        <CollapsibleTrigger asChild>
          <SidebarMenuButton className="text-xs">
            <ChevronDown className="size-3 shrink-0 transition-transform" />
            <Folder className="size-3 shrink-0" />
            <span className="whitespace-nowrap">{node.name}</span>
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {children.map((child) => (
              <TreeItem
                key={child.path}
                node={child}
                selectedFile={selectedFile}
                onSelectFile={onSelectFile}
                defaultOpen={false}
              />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  )
}

// List view component
function ListView({
  files,
  selectedFile,
  onSelectFile,
}: {
  files: FileDiffInfo[]
  selectedFile: string | null
  onSelectFile: (path: string) => void
}) {
  return (
    <SidebarMenu>
      {files.map((file) => {
        const badge = statusBadge[file.status]
        const fileName = file.path.split('/').pop() || file.path
        return (
          <SidebarMenuItem key={file.path}>
            <SidebarMenuButton
              isActive={selectedFile === file.path}
              onClick={() => onSelectFile(file.path)}
              className="text-xs"
            >
              <File className="size-3 shrink-0" />
              <span className="whitespace-nowrap">{fileName}</span>
            </SidebarMenuButton>
            <SidebarMenuBadge className={cn('font-mono text-[10px]', badge.className)}>
              {badge.label}
            </SidebarMenuBadge>
          </SidebarMenuItem>
        )
      })}
    </SidebarMenu>
  )
}

// Tree view component
function TreeView({
  files,
  selectedFile,
  onSelectFile,
}: {
  files: FileDiffInfo[]
  selectedFile: string | null
  onSelectFile: (path: string) => void
}) {
  const tree = useMemo(() => buildTree(files), [files])

  const rootChildren = Array.from(tree.children.values()).sort((a, b) => {
    if (a.isFile !== b.isFile) return a.isFile ? 1 : -1
    return a.name.localeCompare(b.name)
  })

  return (
    <SidebarMenu>
      {rootChildren.map((node) => (
        <TreeItem
          key={node.path}
          node={node}
          selectedFile={selectedFile}
          onSelectFile={onSelectFile}
          defaultOpen={true}
        />
      ))}
    </SidebarMenu>
  )
}

// Collapsible section wrapper
function CollapsibleSection({
  title,
  count,
  defaultOpen = true,
  maxHeight,
  className,
  children,
}: {
  title: string
  count?: number
  defaultOpen?: boolean
  maxHeight?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} className={cn("group/section", className)}>
      <SidebarGroup className="p-0">
        <CollapsibleTrigger asChild>
          <SidebarGroupLabel className="cursor-pointer hover:bg-sidebar-accent rounded-md px-2 py-1.5 select-none">
            <ChevronDown className="size-3 shrink-0 transition-transform group-data-[state=closed]/section:-rotate-90" />
            <span>{title}</span>
            {count !== undefined && (
              <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
                {count}
              </span>
            )}
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent
            className="overflow-x-auto overflow-y-auto"
            style={maxHeight ? { maxHeight } : undefined}
          >
            {children}
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  )
}

export const AppSidebar = memo(function AppSidebar({
  files,
  selectedFile,
  onSelectFile,
  title = 'Files',
  loading = false,
  headerContent,
  ...props
}: AppSidebarProps) {
  if (loading) {
    return (
      <Sidebar {...props}>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>{title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <div className="flex items-center justify-center p-8 text-xs text-muted-foreground">
                Loading...
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarRail />
      </Sidebar>
    )
  }

  if (files.length === 0) {
    return (
      <Sidebar {...props}>
        {headerContent && <SidebarHeader>{headerContent}</SidebarHeader>}
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>{title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <div className="flex items-center justify-center p-8 text-xs text-muted-foreground">
                No files
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarRail />
      </Sidebar>
    )
  }

  return (
    <Sidebar {...props}>
      {headerContent && <SidebarHeader>{headerContent}</SidebarHeader>}
      <SidebarContent className="gap-0">
        <CollapsibleSection
          title="Changed Files"
          count={files.length}
          defaultOpen={true}
          maxHeight="280px"
          className="pb-3"
        >
          <ListView
            files={files}
            selectedFile={selectedFile}
            onSelectFile={onSelectFile}
          />
        </CollapsibleSection>
        <div className="mx-2 border-t border-sidebar-border" />
        <CollapsibleSection
          title="File Tree"
          defaultOpen={true}
          className="pt-3"
        >
          <TreeView
            files={files}
            selectedFile={selectedFile}
            onSelectFile={onSelectFile}
          />
        </CollapsibleSection>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
})

export { SidebarProvider, SidebarInset, SidebarTrigger } from './ui/sidebar'
