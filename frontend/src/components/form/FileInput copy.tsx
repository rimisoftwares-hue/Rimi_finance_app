import React, { useRef, useState } from 'react';
import { cn } from '../lib/utils';
import { Upload, X, Image } from 'lucide-react';

interface FileInputProps {
  label: string;
  error?: string;
  value: File | null;
  onChange: (file: File | null) => void;
  accept?: string;
  containerClassName?: string;
  existingUrl?: string; // Add this for existing image URLs
}

export const FileInput: React.FC<FileInputProps> = ({
  label,
  error,
  value,
  onChange,
  accept = 'image/*',
  containerClassName,
  existingUrl, // Existing image URL from database
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(existingUrl || null);
  const [hasNewFile, setHasNewFile] = useState(false);

  React.useEffect(() => {
    if (value) {
      const url = URL.createObjectURL(value);
      setPreview(url);
      setHasNewFile(true);
      return () => URL.revokeObjectURL(url);
    } else if (existingUrl && !hasNewFile) {
      // Show existing URL if no new file is selected
      setPreview(existingUrl);
    } else {
      setPreview(null);
      setHasNewFile(false);
    }
  }, [value, existingUrl]);

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    onChange(file);
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
    setHasNewFile(false);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  return (
    <div className={cn('w-full', containerClassName)}>
      <label className="input-label">{label}</label>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        className="hidden"
      />
      <div
        onClick={handleClick}
        className={cn(
          'relative flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-all duration-200',
          // hover effects
          'hover:border-[#1E66FF] hover:bg-[#EEF5FF]/50',
          // error or normal state
          error ? 'border-[#EF4C4C]' : 'border-[#DDE3EB]',
          // spacing
          preview ? 'p-1' : 'p-4'
        )}
      >
        {preview ? (
          <>
            <img
              src={preview}
              alt="Preview"
              className="w-full h-full object-cover rounded-md"
            />
            <button
              type="button"
              onClick={handleRemove}
              className="absolute top-1 right-1 p-1 bg-destructive text-destructive-foreground rounded-full hover:opacity-90"
            >
              <X className="w-4 h-4" />
            </button>
            {!hasNewFile && existingUrl && (
              <div className="absolute bottom-1 left-1 px-2 py-1 bg-black/50 text-white text-xs rounded">
                Existing Image
              </div>
            )}
          </>
        ) : (
          <>
            <div className="p-2 rounded-full bg-muted mb-2">
              <Upload className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">Click to upload</p>
          </>
        )}
      </div>
      {error && <p className="error-message">{error}</p>}
    </div>
  );
};