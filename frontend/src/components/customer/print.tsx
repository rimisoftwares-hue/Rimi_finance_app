// utils/print.ts
interface PrintOptions {
  title?: string;
  autoPrint?: boolean;
  closeAfterPrint?: boolean;
  width?: number;
  height?: number;
}

/**
 * Universal print function that works in both Tauri and browser
 */
export async function printHtml(htmlContent: string, options: PrintOptions = {}) {
  const {
    title = 'Print Document',
    autoPrint = true,
    closeAfterPrint = true,
    width = 800,
    height = 600
  } = options;

  // Check if we're in Tauri
  const isTauri = checkIfTauri();

  if (isTauri) {
    await printTauri(htmlContent, { title, autoPrint, closeAfterPrint, width, height });
  } else {
    printBrowser(htmlContent, { title, autoPrint, closeAfterPrint });
  }
}

/**
 * Check if running in Tauri environment
 */
function checkIfTauri(): boolean {
  // Method 1: Check for window.__TAURI__
  if (typeof window !== 'undefined' && (window as any).__TAURI__) {
    return true;
  }
  
  // Method 2: Check for Tauri API
  if (typeof window !== 'undefined' && (window as any).__TAURI_IPC__) {
    return true;
  }
  
  // Method 3: Check user agent (fallback)
  if (typeof navigator !== 'undefined' && navigator.userAgent.includes('Tauri')) {
    return true;
  }
  
  return false;
}

/**
 * Print in Tauri 2.x environment
 */
async function printTauri(htmlContent: string, options: PrintOptions) {
  try {
    // Dynamically import Tauri APIs
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    
    // Create a data URL with the HTML content
    const fullHtml = createPrintHtml(htmlContent, options);
    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`;
    
    // Create a new window for printing
    const printWindow = new WebviewWindow(`print-${Date.now()}`, {
      url: dataUrl,
      title: options.title,
      width: options.width,
      height: options.height,
      resizable: true,
      decorations: true,
      center: true,
      visible: true,
      focus: true,
    });

    // Handle window events
    return new Promise((resolve, reject) => {
      printWindow.once('tauri://created', () => {
        console.log('Print window created');
        
        // Auto-print after a delay
        if (options.autoPrint) {
          setTimeout(() => {
            printWindow.print().then(() => {
              console.log('Print initiated successfully');
              
              // Close window after printing if enabled
              if (options.closeAfterPrint) {
                setTimeout(() => {
                  printWindow.close().catch(e => {
                    console.warn('Failed to close window:', e);
                  });
                }, 1000);
              }
              
              resolve(printWindow);
            }).catch(printError => {
              console.error('Print failed:', printError);
              
              // Try alternative print method
              try {
                // Try to trigger print via JavaScript
                printWindow.listen('tauri://created', () => {
                  setTimeout(() => {
                    printWindow.eval('window.print()').catch(e => {
                      console.error('Eval print failed:', e);
                    });
                  }, 1000);
                });
              } catch (e) {
                console.error('All print methods failed:', e);
              }
              
              // Still resolve even if print fails
              resolve(printWindow);
            });
          }, 1000);
        } else {
          resolve(printWindow);
        }
      });
      
      printWindow.once('tauri://error', (e: any) => {
        console.error('Failed to create print window:', e);
        reject(new Error(`Failed to create print window: ${e}`));
      });
    });
  } catch (error) {
    console.error('Tauri print setup error:', error);
    throw error;
  }
}

/**
 * Create complete HTML document for printing
 */
function createPrintHtml(content: string, options: PrintOptions): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${options.title}</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            margin: 20px;
            padding: 0;
            line-height: 1.6;
            color: #333;
            background: white;
          }
          
          @media print {
            body {
              margin: 0;
              padding: 10mm;
            }
            
            .no-print {
              display: none !important;
            }
            
            .page-break {
              page-break-before: always;
            }
            
            @page {
              size: A4;
              margin: 10mm;
            }
          }
          
          .print-controls {
            position: fixed;
            bottom: 20px;
            left: 0;
            right: 0;
            text-align: center;
            padding: 10px;
            background: rgba(255, 255, 255, 0.95);
            border-top: 1px solid #ddd;
            z-index: 1000;
          }
          
          .print-button {
            padding: 8px 20px;
            background: #007bff;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            margin-right: 10px;
            font-size: 14px;
          }
          
          .close-button {
            padding: 8px 20px;
            background: #6c757d;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
          }
          
          .print-button:hover {
            background: #0056b3;
          }
          
          .close-button:hover {
            background: #545b62;
          }
        </style>
      </head>
      <body>
        ${content}
        
        <div class="no-print print-controls">
          <button class="print-button" onclick="window.print()">Print Document</button>
          <button class="close-button" onclick="window.close()">Close Window</button>
        </div>
        
        <script>
          // Auto-print if enabled
          ${options.autoPrint ? `
            window.addEventListener('load', function() {
              setTimeout(function() {
                try {
                  window.print();
                } catch (error) {
                  console.error('Auto-print failed:', error);
                }
              }, 500);
            });
          ` : ''}
          
          // Close window after printing if enabled
          ${options.closeAfterPrint ? `
            window.addEventListener('afterprint', function() {
              setTimeout(function() {
                try {
                  window.close();
                } catch (error) {
                  console.error('Auto-close failed:', error);
                }
              }, 1000);
            });
          ` : ''}
          
          // Handle keyboard shortcuts
          document.addEventListener('keydown', function(e) {
            if (e.ctrlKey && e.key === 'p') {
              e.preventDefault();
              window.print();
            }
            if (e.key === 'Escape') {
              window.close();
            }
          });
        </script>
      </body>
    </html>
  `;
}

/**
 * Fallback for browser printing
 */
function printBrowser(htmlContent: string, options: PrintOptions) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    throw new Error('Popup blocked. Please allow popups for printing.');
  }

  const fullHtml = createPrintHtml(htmlContent, options);
  
  printWindow.document.write(fullHtml);
  printWindow.document.close();
  
  // Auto-print after content loads
  if (options.autoPrint) {
    setTimeout(() => {
      printWindow.print();
    }, 500);
  }
}

/**
 * Alternative: Print without opening new window (for debugging)
 */
export async function printInCurrentWindow(htmlContent: string) {
  const originalContent = document.body.innerHTML;
  const originalTitle = document.title;
  
  // Create print container
  const printContainer = document.createElement('div');
  printContainer.innerHTML = htmlContent;
  printContainer.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: white;
    z-index: 9999;
    overflow: auto;
    padding: 20px;
  `;
  
  // Add print controls
  const controls = document.createElement('div');
  controls.innerHTML = `
    <div style="position: fixed; bottom: 20px; left: 0; right: 0; text-align: center; z-index: 10000;">
      <button onclick="window.print()" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 4px; margin-right: 10px;">
        Print
      </button>
      <button onclick="document.body.removeChild(this.parentElement.parentElement); document.body.innerHTML = \`${originalContent.replace(/`/g, '\\`')}\`; document.title = '${originalTitle}';" style="padding: 10px 20px; background: #6c757d; color: white; border: none; border-radius: 4px;">
        Close
      </button>
    </div>
  `;
  
  printContainer.appendChild(controls);
  
  // Replace body content
  document.body.innerHTML = '';
  document.body.appendChild(printContainer);
  document.title = 'Print Preview';
  
  // Trigger print
  setTimeout(() => {
    window.print();
  }, 500);
}

/**
 * Print a specific DOM element
 */
export async function printElement(elementId: string, options?: PrintOptions) {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`Element with id "${elementId}" not found`);
  }
  
  const htmlContent = element.outerHTML;
  return printHtml(htmlContent, options);
}

/**
 * Simple print function for Tauri 2.x (alternative approach)
 */
export async function simpleTauriPrint(htmlContent: string, title: string = 'Print Document') {
  try {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    
    // Create HTML document
    const fullHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { 
              margin: 0; 
              padding: 20px; 
              font-family: Arial, sans-serif; 
            }
            @media print {
              @page { margin: 0; }
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          ${htmlContent}
          <script>
            window.onload = () => {
              setTimeout(() => window.print(), 300);
              window.onafterprint = () => {
                setTimeout(() => window.close(), 500);
              };
            };
          </script>
        </body>
      </html>
    `;
    
    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`;
    
    // Create print window
    const printWindow = new WebviewWindow(`print-${Date.now()}`, {
      url: dataUrl,
      title: title,
      width: 800,
      height: 600,
      center: true,
      visible: true,
    });
    
    return printWindow;
  } catch (error) {
    console.error('Simple Tauri print error:', error);
    throw error;
  }
}