import React from 'react';
import { Image, FileText, Layers, PenTool } from 'lucide-react';

const Sidebar = ({ activeTab, setActiveTab }) => {
    const menuItems = [
        { id: 'image', icon: Image, label: 'Image Tools' },
        { id: 'pdf', icon: FileText, label: 'PDF Tools' },
        { id: 'organize', icon: Layers, label: 'Organize PDF' },
        { id: 'sign', icon: PenTool, label: 'Sign PDF' },
    ];

    return (
        <div className="w-64 bg-base-200 text-base-content border-r border-base-300 min-h-screen p-4 flex flex-col shadow-sm">
            <div className="mb-8 px-2 pt-2">
                <h1 className="text-2xl font-bold text-primary">
                    Unified Tools
                </h1>
                <p className="text-xs text-base-content/60 mt-1 font-medium">Web Edition</p>
            </div>

            <nav className="flex-1 space-y-2">
                {menuItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id)}
                        className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 ${activeTab === item.id
                                ? 'bg-primary text-primary-content font-bold shadow-md'
                                : 'text-base-content/75 hover:bg-base-300 hover:text-base-content font-medium'
                            }`}
                    >
                        <item.icon size={20} />
                        <span>{item.label}</span>
                    </button>
                ))}
            </nav>

            <div className="text-center py-4 border-t border-base-300 text-xs text-base-content/60 font-medium">
                © 2026 Unified Tools by Alldone03
            </div>
        </div>
    );
};

export default Sidebar;
