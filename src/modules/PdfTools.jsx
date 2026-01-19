import React, { useState } from 'react';
import Dropzone from '../components/Dropzone';
import { saveAs } from 'file-saver';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';
import { Loader2, Download, Trash2 } from 'lucide-react';

import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const PdfTools = () => {
    const [mode, setMode] = useState('img2pdf');
    const [files, setFiles] = useState([]);
    const [processing, setProcessing] = useState(false);
    const [compressQuality, setCompressQuality] = useState(0.6); // 0.1 to 1.0
    const [logs, setLogs] = useState([]);

    const addLog = (msg) => setLogs(prev => [...prev, msg]);

    const onDrop = (acceptedFiles) => {
        if (mode === 'img2pdf' && !acceptedFiles.every(f => f.type.startsWith('image/'))) {
            addLog("Error: Only images allowed for Image to PDF.");
            return;
        }
        if ((mode === 'pdf2img' || mode === 'compress') && !acceptedFiles.every(f => f.type === 'application/pdf')) {
            addLog("Error: Only PDF allowed.");
            return;
        }
        setFiles(prev => [...prev, ...acceptedFiles]);
        addLog(`Added ${acceptedFiles.length} files.`);
    };

    const removeFile = (index) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const reset = () => {
        setFiles([]);
        setLogs([]);
    }

    const runImg2Pdf = async () => {
        try {
            addLog("Creating PDF...");
            const pdfDoc = await PDFDocument.create();

            for (const file of files) {
                const buffer = await file.arrayBuffer();
                let img;
                if (file.type === 'image/jpeg') img = await pdfDoc.embedJpg(buffer);
                else if (file.type === 'image/png') img = await pdfDoc.embedPng(buffer);
                else {
                    addLog(`Skipping ${file.name} (unsupported format).`);
                    continue;
                }

                const page = pdfDoc.addPage([img.width, img.height]);
                page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
                addLog(`Added ${file.name}`);
            }

            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            saveAs(blob, 'combined.pdf');
            addLog("PDF Saved!");
        } catch (e) {
            addLog(`Error: ${e.message}`);
        }
    };

    const runPdf2Img = async () => {
        if (files.length === 0) return;
        setProcessing(true);
        const zip = new JSZip();

        for (const file of files) {
            try {
                addLog(`Processing ${file.name}...`);
                const arrayBuffer = await file.arrayBuffer();
                const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
                const pdf = await loadingTask.promise;

                addLog(`PDF Loaded. Pages: ${pdf.numPages}`);

                const folder = zip.folder(file.name.replace('.pdf', ''));

                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const viewport = page.getViewport({ scale: 2.0 });
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;

                    await page.render({ canvasContext: context, viewport: viewport }).promise;

                    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
                    folder.file(`page_${i}.png`, blob);
                }
                addLog(`Added pages from ${file.name} to zip`);
            } catch (e) {
                addLog(`Error processing ${file.name}: ${e.message}`);
            }
        }

        addLog("Generating ZIP...");
        const content = await zip.generateAsync({ type: "blob" });
        saveAs(content, "pdf_images.zip");
        addLog("ZIP Saved!");
    };

    const runCompress = async () => {
        // "Compress" via re-encoding images at lower quality
        const zip = new JSZip();

        for (const file of files) {
            try {
                addLog(`Compressing ${file.name} (Quality: ${Math.round(compressQuality * 100)}%)...`);
                const arrayBuffer = await file.arrayBuffer();
                const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
                const pdf = await loadingTask.promise;

                const newPdf = await PDFDocument.create();

                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    // Scale 1.0 = 72DPI usually. 
                    // To maintain decent resolution but compress, we can use e.g. scale 1.5 or 2 and low JPG quality
                    const viewport = page.getViewport({ scale: 1.5 });
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;

                    await page.render({ canvasContext: context, viewport: viewport }).promise;

                    // Export as JPEG with chosen quality
                    const jpegData = canvas.toDataURL('image/jpeg', compressQuality);
                    const jpegImage = await newPdf.embedJpg(jpegData);

                    const newPage = newPdf.addPage([viewport.width, viewport.height]);
                    newPage.drawImage(jpegImage, {
                        x: 0,
                        y: 0,
                        width: viewport.width,
                        height: viewport.height
                    });
                }

                const pdfBytes = await newPdf.save();
                // If multiple files, zip them or save individually? 
                // Let's save individually for simplicity or zip if multiple.
                // Assuming mostly single file use case for compress, but let's just save individually loop
                saveAs(new Blob([pdfBytes], { type: 'application/pdf' }), `${file.name.replace('.pdf', '')}_compressed.pdf`);

            } catch (e) {
                addLog(`Error: ${e.message}`);
            }
        }
    };

    const handleProcess = async () => {
        if (files.length === 0) return;
        setProcessing(true);

        if (mode === 'img2pdf') await runImg2Pdf();
        if (mode === 'pdf2img') await runPdf2Img();
        if (mode === 'compress') await runCompress();

        setProcessing(false);
    };

    return (
        <div className="p-8 max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-8">
                <h2 className="text-3xl font-bold text-slate-800">PDF Tools</h2>
                <div className="flex bg-slate-200 p-1 rounded-lg">
                    {['img2pdf', 'pdf2img', 'compress'].map((m) => (
                        <button
                            key={m}
                            onClick={() => { setMode(m); reset(); }}
                            className={`px-4 py-2 rounded-md text-sm font-medium capitalize transition-all ${mode === m ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                                }`}
                        >
                            {m.replace('2', ' to ')}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    <Dropzone
                        onDrop={onDrop}
                        accept={mode === 'img2pdf' ? { 'image/*': [] } : { 'application/pdf': [] }}
                    />

                    {files.length > 0 && (
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                                <span className="font-medium text-slate-700">{files.length} Files Selected</span>
                                <button onClick={() => setFiles([])} className="text-red-500 text-xs hover:underline">Clear All</button>
                            </div>
                            <ul className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
                                {files.map((file, i) => (
                                    <li key={i} className="px-4 py-2 flex justify-between items-center text-sm">
                                        <span className="truncate text-slate-600">{file.name}</span>
                                        <button onClick={() => removeFile(i)} className="text-slate-400 hover:text-red-500">
                                            <Trash2 size={16} />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                <div className="space-y-6">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                        <h3 className="font-bold text-slate-800 mb-4 capitalize">Actions</h3>

                        {mode === 'compress' && (
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-slate-700 mb-2">Compression Quality: {Math.round(compressQuality * 100)}%</label>
                                <input
                                    type="range" min="10" max="100" step="5"
                                    value={compressQuality * 100}
                                    onChange={(e) => setCompressQuality(parseInt(e.target.value) / 100)}
                                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                />
                                <div className="flex justify-between text-xs text-slate-400 mt-1">
                                    <span>Small Size</span>
                                    <span>High Quality</span>
                                </div>
                            </div>
                        )}

                        <p className="text-sm text-slate-500 mb-4">
                            {mode === 'img2pdf' && "Combine all selected images into one PDF."}
                            {mode === 'pdf2img' && "Save pages as images (ZIP archive)."}
                            {mode === 'compress' && "Re-encode PDF to reduce file size."}
                        </p>

                        <button
                            onClick={handleProcess}
                            disabled={processing || files.length === 0}
                            className="w-full mt-6 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white py-3 rounded-lg font-medium flex justify-center items-center transition-all"
                        >
                            {processing ? <Loader2 className="animate-spin mr-2" /> : <Download className="mr-2" />}
                            {processing ? 'Processing...' : 'Run'}
                        </button>
                    </div>

                    {logs.length > 0 && (
                        <div className="bg-slate-900 text-slate-300 p-4 rounded-xl text-xs font-mono h-40 overflow-y-auto">
                            {logs.map((log, i) => (
                                <div key={i}>{'>'} {log}</div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PdfTools;
