import { invoke } from '@tauri-apps/api/core';
import type { PrintThemeId, PrintToastFn } from './types';
import { getPrintStylesheet } from './styles';

interface TauriAwareWindow extends Window {
  __TAURI__?: unknown;
}

/**
 * Reuses the existing Tauri + browser window + hidden-iframe print flow.
 */
export const triggerPrintDocument = async (
  title: string,
  completeHtml: string,
  toast?: PrintToastFn
): Promise<void> => {
  const isTauri =
    typeof window !== 'undefined' && (window as TauriAwareWindow).__TAURI__ !== undefined;

  if (isTauri) {
    try {
      await invoke('print_document', {
        title,
        htmlContent: completeHtml,
      });

      toast?.({
        title: `${title} - Print Ready`,
        description: 'Document window opened. Wait for content to load, then press Ctrl+P to print.',
        variant: 'default',
      });
      return;
    } catch (tauriError) {
      console.warn('Tauri print command failed, using fallback:', tauriError);
    }
  }

  // Fallback: Open in new browser window with auto-print
  try {
    const printWindow = window.open(
      '',
      '_blank',
      'width=900,height=700,scrollbars=yes,resizable=yes'
    );
    if (printWindow) {
      const htmlWithPrintScript = completeHtml.replace(
        '</body>',
        `
        <script>
          window.addEventListener('load', function() {
            setTimeout(function() {
              window.focus();
              window.print();
            }, 800);
          });
          document.addEventListener('keydown', function(e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
              e.preventDefault();
              window.print();
            }
          });
        </script>
        </body>`
      );

      printWindow.document.open();
      printWindow.document.write(htmlWithPrintScript);
      printWindow.document.close();

      toast?.({
        title: `${title} Ready`,
        description:
          'Print window opened. If print dialog does not appear automatically, press Ctrl+P.',
        variant: 'default',
      });
    } else {
      // Popup blocked - use hidden iframe method
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = 'none';
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentWindow?.document;
      if (iframeDoc) {
        iframeDoc.open();
        iframeDoc.write(completeHtml);
        iframeDoc.close();

        setTimeout(() => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();

          setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          }, 2000);
        }, 500);

        toast?.({
          title: `Printing ${title}`,
          description: 'Print dialog will appear shortly...',
          variant: 'default',
        });
      }
    }
  } catch (fallbackError) {
    console.error('Fallback print failed:', fallbackError);
    toast?.({
      title: 'Print Error',
      description: 'Could not open print dialog. Please check popup blocker settings.',
      variant: 'destructive',
    });
  }
};

/**
 * Exports the generated HTML as a Word-compatible `.doc` document using the
 * `xmlns:o/w` Office namespaces and `application/msword` MIME type.
 */
export const exportWordDocument = (
  filename: string,
  completeOrBodyHtml: string,
  theme: PrintThemeId = 'classic'
): void => {
  const safeFilename = filename.endsWith('.doc') ? filename : `${filename}.doc`;

  let wordHtml = completeOrBodyHtml;
  if (!wordHtml.includes('xmlns:w="urn:schemas-microsoft-com:office:word"')) {
    if (wordHtml.includes('<html')) {
      wordHtml = wordHtml.replace(
        /<html[^>]*>/i,
        `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">`
      );
    } else {
      wordHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><style>${getPrintStylesheet(theme)}</style></head>
<body>${wordHtml}</body></html>`;
    }
  }

  const blob = new Blob(['\ufeff', wordHtml], {
    type: 'application/msword;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = safeFilename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
