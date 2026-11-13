import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';

interface PhotoModalProps {
  isOpen: boolean;
  onClose: () => void;
  src: string;
  alt: string;
}

const PhotoModal = ({ isOpen, onClose, src, alt }: PhotoModalProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl p-2 bg-card border-border">
        <DialogTitle className="sr-only">{alt || 'Customer Photo'}</DialogTitle>
        <DialogDescription className="sr-only">Preview of {alt || 'Customer Photo'}</DialogDescription>
        <img
          src={src}
          alt={alt}
          className="w-full h-auto max-h-[80vh] object-contain rounded-lg"
        />
      </DialogContent>
    </Dialog>
  );
};

export default PhotoModal;
