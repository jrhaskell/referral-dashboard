import * as React from 'react'
import { UploadCloud } from 'lucide-react'

import { cn } from '@/lib/utils'

type FileDropzoneProps = {
  label: string
  description: string
  accept: string
  file?: File | null
  onFile: (file: File) => void
  disabled?: boolean
}

export function FileDropzone({ label, description, accept, file, onFile, disabled }: FileDropzoneProps) {
  const [isDragging, setIsDragging] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement | null>(null)

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (disabled) return
    setIsDragging(false)
    const dropped = event.dataTransfer.files?.[0]
    if (dropped) onFile(dropped)
  }

  const handleSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0]
    if (selected) onFile(selected)
  }

  return (
    <div
      className={cn(
        'flex h-40 w-full flex-col items-center justify-center rounded-xl border border-dashed border-muted-foreground/30 bg-muted/20 p-6 text-center transition',
        isDragging && 'border-primary bg-primary/10',
        disabled && 'opacity-60',
      )}
      onDragOver={(event) => {
        event.preventDefault()
        if (!disabled) setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
    >
      <UploadCloud className="mb-2 h-6 w-6 text-muted-foreground" />
      <p className="text-sm font-semibold">{label}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
      {file ? (
        <p className="mt-2 text-xs text-foreground">{file.name}</p>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">Drop file or click to browse.</p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleSelect}
        className="hidden"
        disabled={disabled}
      />
    </div>
  )
}
