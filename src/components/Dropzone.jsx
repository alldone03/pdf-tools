import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud } from 'lucide-react';
import clsx from 'clsx';

const Dropzone = ({ onDrop, accept, multiple = true, className }) => {
    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept,
        multiple,
    });

    return (
        <div
            {...getRootProps()}
            className={clsx(
                'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors duration-200 flex flex-col items-center justify-center min-h-[160px]',
                isDragActive
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-300 hover:border-slate-400 bg-slate-50',
                className
            )}
        >
            <input {...getInputProps()} />
            <UploadCloud
                size={40}
                className={clsx(
                    'mb-3 transition-colors duration-200',
                    isDragActive ? 'text-blue-500' : 'text-slate-400'
                )}
            />
            {isDragActive ? (
                <p className="text-blue-600 font-medium">Drop the files here...</p>
            ) : (
                <div className="space-y-1">
                    <p className="text-slate-700 font-medium">Drag & drop files here, or click to select</p>
                    <p className="text-sm text-slate-500">Supports images and documents</p>
                </div>
            )}
        </div>
    );
};

export default Dropzone;
