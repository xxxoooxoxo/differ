import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'

interface ImageData {
  path: string
  data?: string
  mimeType?: string
  exists: boolean
  ref: string
}

interface ImagePreviewProps {
  path: string
  status: 'added' | 'deleted' | 'modified' | 'renamed' | 'untracked'
}

async function fetchImage(path: string, ref?: string): Promise<ImageData> {
  const params = new URLSearchParams({ path })
  if (ref) params.set('ref', ref)

  const response = await fetch(`/api/diff/image?${params}`)
  return response.json()
}

export function ImagePreview({ path, status }: ImagePreviewProps) {
  const [loading, setLoading] = useState(true)
  const [oldImage, setOldImage] = useState<ImageData | null>(null)
  const [newImage, setNewImage] = useState<ImageData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadImages() {
      setLoading(true)
      setError(null)

      try {
        // For deleted files, only load old (HEAD) version
        // For added/untracked files, only load new (working) version
        // For modified files, load both
        if (status === 'deleted') {
          const old = await fetchImage(path, 'HEAD')
          setOldImage(old)
          setNewImage(null)
        } else if (status === 'added' || status === 'untracked') {
          const current = await fetchImage(path)
          setOldImage(null)
          setNewImage(current)
        } else {
          // Modified or renamed - load both
          const [old, current] = await Promise.all([
            fetchImage(path, 'HEAD'),
            fetchImage(path),
          ])
          setOldImage(old)
          setNewImage(current)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load images')
      } finally {
        setLoading(false)
      }
    }

    loadImages()
  }, [path, status])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    )
  }

  const hasOld = oldImage?.exists && oldImage.data
  const hasNew = newImage?.exists && newImage.data

  if (!hasOld && !hasNew) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">Unable to load image preview</p>
      </div>
    )
  }

  // Single image (added or deleted)
  if (!hasOld || !hasNew) {
    const image = hasNew ? newImage : oldImage
    const label = hasNew ? 'New' : 'Deleted'
    const bgClass = hasNew ? 'bg-emerald-500/10' : 'bg-red-500/10'
    const borderClass = hasNew ? 'border-emerald-500/30' : 'border-red-500/30'

    return (
      <div className="p-4">
        <div className={`rounded-lg border ${borderClass} ${bgClass} p-4`}>
          <div className="mb-2 text-xs font-medium text-muted-foreground">{label}</div>
          <div className="flex items-center justify-center bg-[#0d1117] rounded p-2">
            <img
              src={`data:${image!.mimeType};base64,${image!.data}`}
              alt={path}
              className="max-h-[400px] max-w-full object-contain"
              style={{ imageRendering: 'auto' }}
            />
          </div>
        </div>
      </div>
    )
  }

  // Side-by-side comparison for modified images
  return (
    <div className="flex gap-4 p-4">
      {/* Old version */}
      <div className="flex-1 min-w-0">
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
          <div className="mb-2 text-xs font-medium text-muted-foreground">Previous (HEAD)</div>
          <div className="flex items-center justify-center bg-[#0d1117] rounded p-2">
            <img
              src={`data:${oldImage!.mimeType};base64,${oldImage!.data}`}
              alt={`${path} (old)`}
              className="max-h-[400px] max-w-full object-contain"
              style={{ imageRendering: 'auto' }}
            />
          </div>
        </div>
      </div>

      {/* New version */}
      <div className="flex-1 min-w-0">
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
          <div className="mb-2 text-xs font-medium text-muted-foreground">Current</div>
          <div className="flex items-center justify-center bg-[#0d1117] rounded p-2">
            <img
              src={`data:${newImage!.mimeType};base64,${newImage!.data}`}
              alt={`${path} (new)`}
              className="max-h-[400px] max-w-full object-contain"
              style={{ imageRendering: 'auto' }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
