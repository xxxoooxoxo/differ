import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'

interface BranchInfo {
  name: string
  current: boolean
}

interface BranchSelectorProps {
  branches: BranchInfo[]
  selected: string
  onChange: (branch: string) => void
  label?: string
}

export function BranchSelector({ branches, selected, onChange, label }: BranchSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-xs text-muted-foreground w-10">{label}</span>}
      <Select value={selected} onValueChange={onChange}>
        <SelectTrigger size="sm" className="h-7 w-full text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {branches.map((branch) => (
            <SelectItem key={branch.name} value={branch.name} className="text-xs">
              {branch.name}{branch.current ? ' •' : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
