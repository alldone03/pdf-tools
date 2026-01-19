import React, { useState } from 'react';
import Dropzone from '../components/Dropzone';
import { saveAs } from 'file-saver';
import heic2any from 'heic2any';
import { Loader2, Download, Trash2, ArrowRight } from 'lucide-react';

const ImageTools = () => {
    const [mode, setMode] = useState('convert'); // 'convert' | 'resize'
    const [files, setFiles] = useState([]);
    const [processing, setProcessing] = useState(false);
    const [targetFormat, setTargetFormat] = useState('png');
    const [resizeDim, setResizeDim] = useState({ width: '', height: '' });
    const [logs, setLogs] = useState([]);

    const addLog = (msg) => setLogs(prev => [...prev, msg]);

    const onDrop = (acceptedFiles) => {
        setFiles(prev => [...prev, ...acceptedFiles]);
        addLog(`Added ${acceptedFiles.length} files.`);
    };

    const removeFile = (index) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const convertImage = async (file, format) => {
        try {
            let blob = file;

            // Handle HEIC
            if (file.name.toLowerCase().endsWith('.heic')) {
                addLog(`Converting HEIC: ${file.name}...`);
                blob = await heic2any({ blob: file, toType: "image/png" });
                if (Array.isArray(blob)) blob = blob[0];
            }

            // Load into Image for format conversion or just save
            // If format matches logic (e.g. png to png), we might skip, but user might want to re-encode.
            // We'll use Canvas for universal conversion

            const img = await createImageBitmap(blob);
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            const mimeType = format === 'jpg' ? 'image/jpeg' : `image/${format}`;

            return new Promise((resolve) => {
                canvas.toBlob((b) => {
                    resolve(b);
                }, mimeType, 0.9);
            });

        } catch (e) {
            console.error(e);
            addLog(`Error converting ${file.name}: ${e.message}`);
            return null;
        }
    };

    const resizeImage = async (file, w, h) => {
        try {
            const blob = file; // Assume not HEIC for now or handle HEIC first logic if needed
            // Ideally reuse convert logic for reading
            let srcBlob = blob;
            if (file.name.toLowerCase().endsWith('.heic')) {
                srcBlob = await heic2any({ blob: file, toType: "image/png" });
                if (Array.isArray(srcBlob)) srcBlob = srcBlob[0];
            }

            const img = await createImageBitmap(srcBlob);

            let newW = img.width;
            let newH = img.height;

            if (w && h) { newW = parseInt(w); newH = parseInt(h); }
            else if (w) { newW = parseInt(w); newH = (img.height / img.width) * newW; }
            else if (h) { newH = parseInt(h); newW = (img.width / img.height) * newH; }

            const canvas = document.createElement('canvas');
            canvas.width = newW;
            canvas.height = newH;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, newW, newH);

            return new Promise((resolve) => {
                canvas.toBlob((b) => resolve(b), file.type, 0.9);
            });
        } catch (e) {
            addLog(`Error resizing ${file.name}: ${e.message}`);
            return null;
        }
    }

    const handleProcess = async () => {
        if (files.length === 0) return;
        setProcessing(true);
        setLogs([]);

        let processedCount = 0;

        for (const file of files) {
            addLog(`Processing ${file.name}...`);
            let resultBlob = null;
            let ext = targetFormat;

            if (mode === 'convert') {
                resultBlob = await convertImage(file, targetFormat);
            } else {
                resultBlob = await resizeImage(file, resizeDim.width, resizeDim.height);
                ext = file.name.split('.').pop();
            }

            if (resultBlob) {
                const newName = file.name.substring(0, file.name.lastIndexOf('.')) + (mode === 'resize' ? '_resized' : '') + '.' + ext;
                saveAs(resultBlob, newName);
                processedCount++;
            }
        }

        addLog(`Done! Processed ${processedCount} files.`);
        setProcessing(false);
    };

    return (
        <div className="p-8 max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-8">
                <h2 className="text-3xl font-bold text-slate-800">Image Tools</h2>
                <div className="flex bg-slate-200 p-1 rounded-lg">
                    {['convert', 'resize'].map((m) => (
                        <button
                            key={m}
                            onClick={() => setMode(m)}
                            className={`px-4 py-2 rounded-md text-sm font-medium capitalize transition-all ${mode === m ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                                }`}
                        >
                            {m}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    <Dropzone onDrop={onDrop} accept={{ 'image/*': [] }} />

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
                        <h3 className="font-bold text-slate-800 mb-4 capitalize">{mode} Settings</h3>

                        {mode === 'convert' ? (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 mb-1">Target Format</label>
                                    <select
                                        value={targetFormat}
                                        onChange={(e) => setTargetFormat(e.target.value)}
                                        className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    >
                                        <option value="png">PNG</option>
                                        <option value="jpg">JPG</option>
                                        <option value="webp">WEBP</option>
                                    </select>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-600 mb-1">Width</label>
                                        <input
                                            type="number"
                                            placeholder="Auto"
                                            value={resizeDim.width}
                                            onChange={(e) => setResizeDim({ ...resizeDim, width: e.target.value })}
                                            className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-600 mb-1">Height</label>
                                        <input
                                            type="number"
                                            placeholder="Auto"
                                            value={resizeDim.height}
                                            onChange={(e) => setResizeDim({ ...resizeDim, height: e.target.value })}
                                            className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    </div>
                                </div>
                                <p className="text-xs text-slate-400">Leave one blank to preserve aspect ratio.</p>
                            </div>
                        )}

                        <button
                            onClick={handleProcess}
                            disabled={processing || files.length === 0}
                            className="w-full mt-6 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white py-3 rounded-lg font-medium flex justify-center items-center transition-all"
                        >
                            {processing ? <Loader2 className="animate-spin mr-2" /> : <Download className="mr-2" />}
                            {processing ? 'Processing...' : 'Start Processing'}
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

export default ImageTools;
