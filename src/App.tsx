/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import {
  FileArchive,
  FileText,
  Upload,
  Download,
  Trash2,
  ArrowUp,
  ArrowDown,
  Layers,
  Eye,
  CheckCircle2,
  Loader2,
  Sparkles,
  BookOpen,
  Sliders,
  AlertCircle
} from 'lucide-react';

interface ComicPage {
  name: string;
  data: Uint8Array;
  blobUrl: string;
}

interface CbzFileItem {
  id: string;
  name: string;
  size: number;
  file: File;
  coverUrl?: string;
  pages: ComicPage[];
  isLoading: boolean;
  error?: string;
}

interface ConversionSettings {
  outputFilename: string;
  fitMode: 'original' | 'a4' | 'fit-page';
  imageQuality: number;
  pageOrientation: 'portrait' | 'landscape' | 'auto';
  margin: number;
}

export default function App() {
  const [cbzFiles, setCbzFiles] = useState<CbzFileItem[]>([]);
  const [activeTab, setActiveTab] = useState<'queue' | 'pages' | 'settings' | 'viewer'>('queue');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ step: '', percent: 0, currentFile: '' });
  const [conversionResult, setConversionResult] = useState<{
    pdfBlobUrl: string;
    pdfBytes: Uint8Array;
    totalPages: number;
    fileSize: string;
  } | null>(null);

  const [settings, setSettings] = useState<ConversionSettings>({
    outputFilename: 'merged_comic.pdf',
    fitMode: 'original',
    imageQuality: 0.85,
    pageOrientation: 'auto',
    margin: 0
  });

  const [selectedCbzForPages, setSelectedCbzForPages] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Natural sorting for comic pages (e.g. page_2 before page_10)
  const naturalSort = (a: string, b: string) => {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  };

  const handleFilesAdded = async (incomingFiles: FileList | File[]) => {
    const newItems: CbzFileItem[] = [];

    for (let i = 0; i < incomingFiles.length; i++) {
      const file = incomingFiles[i];
      const id = Math.random().toString(36).substring(2, 9);
      const lowerName = file.name.toLowerCase();
      
      if (!lowerName.endsWith('.cbz') && !lowerName.endsWith('.zip') && !file.type.includes('zip')) {
        continue;
      }

      const newItem: CbzFileItem = {
        id,
        name: file.name,
        size: file.size,
        file,
        pages: [],
        isLoading: true
      };
      newItems.push(newItem);
    }

    if (newItems.length === 0) {
      alert('Please select valid .cbz or .zip comic archive files.');
      return;
    }

    setCbzFiles(prev => [...prev, ...newItems]);
    if (!selectedCbzForPages && newItems.length > 0) {
      setSelectedCbzForPages(newItems[0].id);
    }

    // Process archives asynchronously
    for (const item of newItems) {
      try {
        const arrayBuffer = await item.file.arrayBuffer();
        const zip = new JSZip();
        const zipContent = await zip.loadAsync(arrayBuffer);

        const imageFiles: { name: string; zipEntry: JSZip.JSZipObject }[] = [];

        zipContent.forEach((relativePath, zipEntry) => {
          if (zipEntry.dir) return;
          const lower = relativePath.toLowerCase();
          if (
            lower.endsWith('.jpg') ||
            lower.endsWith('.jpeg') ||
            lower.endsWith('.png') ||
            lower.endsWith('.webp') ||
            lower.endsWith('.gif') ||
            lower.endsWith('.avif')
          ) {
            if (!relativePath.includes('__MACOSX') && !relativePath.startsWith('.')) {
              imageFiles.push({ name: relativePath, zipEntry });
            }
          }
        });

        imageFiles.sort((a, b) => naturalSort(a.name, b.name));

        const pages: ComicPage[] = [];
        for (const img of imageFiles) {
          const uint8 = await img.zipEntry.async('uint8array');
          let mime = 'image/jpeg';
          const lowerName = img.name.toLowerCase();
          if (lowerName.endsWith('.png')) mime = 'image/png';
          else if (lowerName.endsWith('.webp')) mime = 'image/webp';
          else if (lowerName.endsWith('.gif')) mime = 'image/gif';
          else if (lowerName.endsWith('.avif')) mime = 'image/avif';

          const blob = new Blob([uint8.buffer as ArrayBuffer], { type: mime });
          const blobUrl = URL.createObjectURL(blob);
          pages.push({
            name: img.name,
            data: uint8,
            blobUrl
          });
        }

        const coverUrl = pages.length > 0 ? pages[0].blobUrl : undefined;

        setCbzFiles(prev =>
          prev.map(f => (f.id === item.id ? { ...f, pages, coverUrl, isLoading: false } : f))
        );
      } catch (err: any) {
        console.error('Error reading CBZ file:', err);
        setCbzFiles(prev =>
          prev.map(f => (f.id === item.id ? { ...f, isLoading: false, error: err.message || 'Failed to read archive' } : f))
        );
      }
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesAdded(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const removeFile = (id: string) => {
    setCbzFiles(prev => {
      const updated = prev.filter(f => f.id !== id);
      if (selectedCbzForPages === id) {
        setSelectedCbzForPages(updated.length > 0 ? updated[0].id : null);
      }
      return updated;
    });
  };

  const moveFile = (index: number, direction: 'up' | 'down') => {
    const newFiles = [...cbzFiles];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newFiles.length) return;
    const temp = newFiles[index];
    newFiles[index] = newFiles[targetIndex];
    newFiles[targetIndex] = temp;
    setCbzFiles(newFiles);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const totalPagesCount = cbzFiles.reduce((acc, file) => acc + file.pages.length, 0);

  // Helper to normalize any image format (WebP, PNG, JPEG, GIF) to standard JPEG via Canvas
  const normalizeImageToJpeg = (uint8: Uint8Array, mimeType: string, quality: number): Promise<Uint8Array> => {
    return new Promise((resolve, reject) => {
      const blob = new Blob([uint8.buffer as ArrayBuffer], { type: mimeType || 'image/jpeg' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }
        // Fill white background for transparent images
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        canvas.toBlob(
          async blobResult => {
            if (!blobResult) {
              reject(new Error('Canvas conversion failed'));
              return;
            }
            const buf = await blobResult.arrayBuffer();
            resolve(new Uint8Array(buf));
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = err => {
        URL.revokeObjectURL(url);
        reject(err);
      };
      img.src = url;
    });
  };

  const generatePDF = async () => {
    if (cbzFiles.length === 0 || totalPagesCount === 0) {
      alert('Please add at least one comic archive with images.');
      return;
    }

    setIsProcessing(true);
    setConversionResult(null);

    try {
      setProgress({ step: 'Initializing PDF document...', percent: 5, currentFile: '' });
      const pdfDoc = await PDFDocument.create();

      let processedPages = 0;
      const total = totalPagesCount;

      for (let fIdx = 0; fIdx < cbzFiles.length; fIdx++) {
        const comic = cbzFiles[fIdx];
        setProgress({
          step: `Processing archive (${fIdx + 1}/${cbzFiles.length}): ${comic.name}`,
          percent: Math.round((processedPages / total) * 75),
          currentFile: comic.name
        });

        for (let pIdx = 0; pIdx < comic.pages.length; pIdx++) {
          const page = comic.pages[pIdx];
          processedPages++;

          if (processedPages % 3 === 0 || processedPages === 1) {
            setProgress({
              step: `Converting page ${processedPages} of ${total}...`,
              percent: Math.min(85, Math.round((processedPages / total) * 85)),
              currentFile: `${comic.name} - Page ${pIdx + 1}`
            });
            await new Promise(r => setTimeout(r, 2));
          }

          try {
            let mime = 'image/jpeg';
            const lowerName = page.name.toLowerCase();
            if (lowerName.endsWith('.png')) mime = 'image/png';
            else if (lowerName.endsWith('.webp')) mime = 'image/webp';
            else if (lowerName.endsWith('.gif')) mime = 'image/gif';
            else if (lowerName.endsWith('.avif')) mime = 'image/avif';

            // Normalize every image via canvas to ensure 100% compatibility with pdf-lib & correct compression
            const jpegBytes = await normalizeImageToJpeg(page.data, mime, settings.imageQuality);
            const embeddedImage = await pdfDoc.embedJpg(jpegBytes);

            const imgWidth = embeddedImage.width;
            const imgHeight = embeddedImage.height;

            let pageWidth = imgWidth;
            let pageHeight = imgHeight;

            if (settings.fitMode === 'a4') {
              pageWidth = 595.28;
              pageHeight = 841.89;
            } else if (settings.fitMode === 'fit-page') {
              const ratio = imgWidth / imgHeight;
              if (settings.pageOrientation === 'landscape' || (settings.pageOrientation === 'auto' && ratio > 1)) {
                pageWidth = 841.89;
                pageHeight = 595.28;
              } else {
                pageWidth = 595.28;
                pageHeight = 841.89;
              }
            }

            const pdfPage = pdfDoc.addPage([pageWidth, pageHeight]);

            const margin = settings.margin;
            const availWidth = pageWidth - margin * 2;
            const availHeight = pageHeight - margin * 2;

            let drawWidth = availWidth;
            let drawHeight = (imgHeight / imgWidth) * drawWidth;

            if (drawHeight > availHeight) {
              drawHeight = availHeight;
              drawWidth = (imgWidth / imgHeight) * drawHeight;
            }

            const x = margin + (availWidth - drawWidth) / 2;
            const y = margin + (availHeight - drawHeight) / 2;

            pdfPage.drawImage(embeddedImage, {
              x,
              y,
              width: drawWidth,
              height: drawHeight,
            });
          } catch (pageErr) {
            console.error(`Failed to process page ${page.name}:`, pageErr);
          }
        }
      }

      setProgress({ step: 'Building final PDF file...', percent: 95, currentFile: '' });
      const pdfBytes = await pdfDoc.save();
      const pdfBlob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      const pdfBlobUrl = URL.createObjectURL(pdfBlob);

      setConversionResult({
        pdfBlobUrl,
        pdfBytes,
        totalPages: processedPages,
        fileSize: formatFileSize(pdfBytes.length)
      });

      setProgress({ step: 'Conversion complete!', percent: 100, currentFile: '' });
      setIsProcessing(false);
      setActiveTab('viewer');
    } catch (err: any) {
      console.error('PDF generation error:', err);
      alert('Error generating PDF: ' + (err.message || 'Unknown error'));
      setIsProcessing(false);
    }
  };

  const downloadPDF = () => {
    if (!conversionResult) return;
    const link = document.createElement('a');
    link.href = conversionResult.pdfBlobUrl;
    link.download = settings.outputFilename.endsWith('.pdf') ? settings.outputFilename : `${settings.outputFilename}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-600 selection:text-white">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-40 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="bg-gradient-to-tr from-indigo-600 to-violet-500 p-2.5 rounded-xl shadow-lg shadow-indigo-500/20 text-white">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              CBZ to PDF Comic Merger
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Pro
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Combine multiple `.cbz` and `.zip` comic archives into a single seamless PDF
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {cbzFiles.length > 0 && (
            <div className="hidden sm:flex items-center space-x-4 text-xs bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700">
              <div>
                <span className="text-slate-400">Archives:</span> <span className="font-bold text-white">{cbzFiles.length}</span>
              </div>
              <div className="w-px h-3 bg-slate-700"></div>
              <div>
                <span className="text-slate-400">Total Pages:</span> <span className="font-bold text-indigo-400">{totalPagesCount}</span>
              </div>
            </div>
          )}

          {conversionResult && (
            <button
              onClick={downloadPDF}
              className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-medium shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Download PDF</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 flex flex-col gap-6">
        {/* Navigation Tabs */}
        {cbzFiles.length > 0 && (
          <div className="flex border-b border-slate-800 gap-2 overflow-x-auto pb-px">
            <button
              onClick={() => setActiveTab('queue')}
              className={`flex items-center space-x-2 px-4 py-2.5 border-b-2 font-medium text-sm transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'queue'
                  ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10 rounded-t-lg'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileArchive className="w-4 h-4" />
              <span>Comic Queue ({cbzFiles.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('pages')}
              className={`flex items-center space-x-2 px-4 py-2.5 border-b-2 font-medium text-sm transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'pages'
                  ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10 rounded-t-lg'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Page Inspection ({totalPagesCount})</span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`flex items-center space-x-2 px-4 py-2.5 border-b-2 font-medium text-sm transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'settings'
                  ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10 rounded-t-lg'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span>PDF Settings</span>
            </button>

            {conversionResult && (
              <button
                onClick={() => setActiveTab('viewer')}
                className={`flex items-center space-x-2 px-4 py-2.5 border-b-2 font-medium text-sm transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === 'viewer'
                    ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10 rounded-t-lg'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Eye className="w-4 h-4" />
                <span>Result & Viewer</span>
              </button>
            )}
          </div>
        )}

        {/* Dropzone / Upload Banner */}
        <div
          ref={dropZoneRef}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-all ${
            cbzFiles.length === 0
              ? 'border-indigo-500/40 bg-slate-900/40 hover:bg-slate-900/80 hover:border-indigo-500'
              : 'border-slate-800 bg-slate-900/20 hover:bg-slate-900/40 hover:border-slate-700 py-6'
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={e => e.target.files && handleFilesAdded(e.target.files)}
            multiple
            accept=".cbz,.zip,application/zip,application/x-cbz"
            className="hidden"
          />
          <div className="flex flex-col items-center justify-center space-y-3">
            <div className={`p-4 rounded-full ${cbzFiles.length === 0 ? 'bg-indigo-600/20 text-indigo-400' : 'bg-slate-800 text-slate-300'}`}>
              <Upload className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">
                {cbzFiles.length === 0 ? 'Drop your .cbz or .zip comic files here' : 'Add more comic files'}
              </h3>
              <p className="text-sm text-slate-400 mt-1">
                Supports multiple CBZ/ZIP archives containing JPEG, PNG, WebP, or GIF images
              </p>
            </div>
            <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium shadow-md shadow-indigo-600/20 transition-all mt-2">
              Browse Files
            </button>
          </div>
        </div>

        {/* Processing Overlay */}
        {isProcessing && (
          <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl p-8 flex flex-col items-center justify-center shadow-2xl relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 via-violet-500/5 to-indigo-500/5 animate-pulse"></div>
            <div className="relative z-10 flex flex-col items-center space-y-4 max-w-md w-full text-center">
              <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
              <div>
                <h4 className="text-lg font-bold text-white">Generating Comic PDF</h4>
                <p className="text-sm text-slate-400 mt-1">{progress.step}</p>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden border border-slate-700">
                <div
                  className="bg-gradient-to-r from-indigo-600 to-violet-500 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${progress.percent}%` }}
                ></div>
              </div>
              <div className="text-xs text-slate-400 font-mono">{progress.percent}% completed</div>
            </div>
          </div>
        )}

        {/* Tab Content: Queue */}
        {activeTab === 'queue' && cbzFiles.length > 0 && !isProcessing && (
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">Comic Queue & Order</h2>
                <p className="text-xs text-slate-400">
                  Use arrow buttons to reorder volumes. Files will be merged into the PDF in this exact sequence.
                </p>
              </div>
              <button
                onClick={generatePDF}
                className="flex items-center space-x-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white px-6 py-3 rounded-xl font-medium shadow-xl shadow-indigo-600/25 transition-all cursor-pointer"
              >
                <Sparkles className="w-5 h-5" />
                <span>Convert & Merge to PDF ({totalPagesCount} Pages)</span>
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {cbzFiles.map((comic, index) => (
                <div
                  key={comic.id}
                  className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-4 hover:border-slate-700 transition-all"
                >
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-16 bg-slate-800 rounded-lg overflow-hidden flex-shrink-0 border border-slate-700 flex items-center justify-center">
                      {comic.isLoading ? (
                        <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                      ) : comic.coverUrl ? (
                        <img src={comic.coverUrl} alt={comic.name} className="w-full h-full object-cover" />
                      ) : (
                        <FileArchive className="w-6 h-6 text-slate-500" />
                      )}
                    </div>

                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                          #{index + 1}
                        </span>
                        <h4 className="font-semibold text-white text-sm sm:text-base truncate max-w-md">{comic.name}</h4>
                      </div>
                      <div className="flex items-center space-x-3 text-xs text-slate-400 mt-1">
                        <span>{formatFileSize(comic.size)}</span>
                        <span>•</span>
                        <span>
                          {comic.isLoading ? 'Extracting pages...' : `${comic.pages.length} pages`}
                        </span>
                        {comic.error && <span className="text-red-400 font-medium">({comic.error})</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1 sm:space-x-2">
                    <button
                      onClick={() => {
                        setSelectedCbzForPages(comic.id);
                        setActiveTab('pages');
                      }}
                      className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
                      title="Inspect Pages"
                    >
                      <Layers className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => moveFile(index, 'up')}
                      disabled={index === 0}
                      className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl disabled:opacity-30 disabled:hover:bg-transparent transition-all cursor-pointer"
                      title="Move Up"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => moveFile(index, 'down')}
                      disabled={index === cbzFiles.length - 1}
                      className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl disabled:opacity-30 disabled:hover:bg-transparent transition-all cursor-pointer"
                      title="Move Down"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => removeFile(comic.id)}
                      className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl transition-all cursor-pointer"
                      title="Remove Archive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab Content: Pages Inspection */}
        {activeTab === 'pages' && cbzFiles.length > 0 && !isProcessing && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white">Page Inspection</h2>
                <p className="text-xs text-slate-400">
                  Preview extracted pages for selected archive. Check natural sorting order.
                </p>
              </div>

              {/* Archive selector */}
              <div className="flex items-center space-x-2">
                <span className="text-xs text-slate-400">Archive:</span>
                <select
                  value={selectedCbzForPages || ''}
                  onChange={e => setSelectedCbzForPages(e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-white rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
                >
                  {cbzFiles.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.pages.length} pages)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {selectedCbzForPages && (() => {
              const currentComic = cbzFiles.find(f => f.id === selectedCbzForPages);
              if (!currentComic) return null;

              return (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {currentComic.pages.map((page, pIdx) => (
                    <div
                      key={pIdx}
                      className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col group hover:border-slate-700 transition-all"
                    >
                      <div className="aspect-[3/4] bg-slate-950 relative overflow-hidden flex items-center justify-center">
                        <img
                          src={page.blobUrl}
                          alt={page.name}
                          className="w-full h-full object-contain cursor-pointer hover:scale-105 transition-transform"
                          onClick={() => setPreviewImage(page.blobUrl)}
                        />
                        <div className="absolute top-2 left-2 bg-slate-900/80 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] font-mono font-bold text-slate-200">
                          #{pIdx + 1}
                        </div>
                      </div>
                      <div className="p-2 bg-slate-900/90 text-[11px] text-slate-400 truncate font-mono">
                        {page.name}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {/* Tab Content: Settings */}
        {activeTab === 'settings' && !isProcessing && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 max-w-3xl mx-auto w-full flex flex-col gap-6">
            <div>
              <h2 className="text-xl font-bold text-white">PDF Conversion Settings</h2>
              <p className="text-xs text-slate-400 mt-1">
                Customize layout, fit mode, and output parameters for your comic PDF.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-slate-300">Output Filename</label>
                <input
                  type="text"
                  value={settings.outputFilename}
                  onChange={e => setSettings({ ...settings, outputFilename: e.target.value })}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-slate-300">Page Fit Mode</label>
                <select
                  value={settings.fitMode}
                  onChange={e => setSettings({ ...settings, fitMode: e.target.value as any })}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="original">Original Image Dimensions (Best Quality)</option>
                  <option value="a4">Standard A4 Portrait</option>
                  <option value="fit-page">Auto Fit to Page (Maintains Aspect Ratio)</option>
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-slate-300">Image Quality / Compression</label>
                <select
                  value={settings.imageQuality}
                  onChange={e => setSettings({ ...settings, imageQuality: parseFloat(e.target.value) })}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="1.0">Maximum Quality (Lossless / 100%)</option>
                  <option value="0.9">High Quality (90%)</option>
                  <option value="0.8">Balanced (80%)</option>
                  <option value="0.65">Compressed / Smaller Size (65%)</option>
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-slate-300">Page Margins (Points)</label>
                <input
                  type="number"
                  min="0"
                  max="50"
                  value={settings.margin}
                  onChange={e => setSettings({ ...settings, margin: parseInt(e.target.value) || 0 })}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => {
                  setActiveTab('queue');
                  generatePDF();
                }}
                className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-medium shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
              >
                <Sparkles className="w-5 h-5" />
                <span>Save & Generate PDF</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab Content: Viewer & Result */}
        {activeTab === 'viewer' && conversionResult && !isProcessing && (
          <div className="flex flex-col gap-6">
            <div className="bg-gradient-to-r from-emerald-900/40 via-slate-900 to-indigo-900/40 border border-emerald-500/30 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">PDF Successfully Generated!</h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    {conversionResult.totalPages} pages merged • {conversionResult.fileSize} • Ready for reading
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <button
                  onClick={downloadPDF}
                  className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-xl font-medium shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
                >
                  <Download className="w-5 h-5" />
                  <span>Download PDF ({conversionResult.fileSize})</span>
                </button>
              </div>
            </div>

            {/* Embedded PDF Viewer */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col h-[700px]">
              <div className="bg-slate-950 px-6 py-3 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center space-x-2 text-sm text-slate-300">
                  <FileText className="w-4 h-4 text-indigo-400" />
                  <span>{settings.outputFilename}</span>
                </div>
                <button
                  onClick={downloadPDF}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Save to Device</span>
                </button>
              </div>
              <iframe
                src={conversionResult.pdfBlobUrl}
                className="w-full flex-1 bg-slate-950"
                title="Comic PDF Preview"
              />
            </div>
          </div>
        )}
      </main>

      {/* Image Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl bg-slate-900 border border-slate-800 p-2">
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-4 right-4 z-10 bg-slate-800 hover:bg-slate-700 text-white rounded-full p-2 text-xs shadow-md transition-all cursor-pointer"
            >
              ✕
            </button>
            <img src={previewImage} alt="Page Preview" className="max-h-[85vh] max-w-full object-contain rounded-xl mx-auto" />
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-900/40 py-6 text-center text-xs text-slate-500">
        CBZ to PDF Comic Merger • Client-side private processing • Fast & secure
      </footer>
    </div>
  );
}
