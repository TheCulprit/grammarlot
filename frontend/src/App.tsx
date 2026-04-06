import { useState, useEffect, useRef } from 'react'
import { Play, Folder, FileText, Loader2, Save, ChevronRight, ChevronDown, Trash2, Edit2, FolderPlus, FilePlus, Settings, Pin, X, Columns } from 'lucide-react'
import Editor from '@monaco-editor/react'
import { generateText, fetchFiles, getFileContent, saveFileContent, deleteItem, createFolder, moveItem, getAppConfig, saveAppConfig } from './api'
import { setupParsifalLanguage, validateParsifalCode } from './parsifalLanguage'

type FileNode = { name: string; type: "file" | "directory"; path: string; children?: FileNode[]; };
type EditState = { path: string; type: 'file' | 'folder'; mode: 'create' | 'rename'; initialValue: string; } | null;
type OpenFile = { path: string; isPinned: boolean; hasChanges: boolean; initialContent: string; pane: 'left' | 'right'; };

function App() {
	const [fileTree, setFileTree] = useState<FileNode | null>(null)
	const fileTreeRef = useRef<FileNode | null>(null) // Used to feed latest files to Monaco Autocomplete

	const [openFiles, setOpenFiles] = useState<OpenFile[]>([])
	const [activeFiles, setActiveFiles] = useState<{ left: string | null; right: string | null }>({ left: null, right: null })
	const [focusedPane, setFocusedPane] = useState<'left' | 'right'>('left')
	const [splitWidthRatio, setSplitWidthRatio] = useState(50) // Percentage
	const [isDraggingSplit, setIsDraggingSplit] = useState(false)

	const [output, setOutput] = useState("")
	const [traceLogs, setTraceLogs] = useState<any[]>([])
	const [isLoading, setIsLoading] = useState(false)
	const [isSaving, setIsSaving] = useState(false)
	const [activeTab, setActiveTab] = useState<"output" | "trace">("output")
	const [isCleanOutput, setIsCleanOutput] = useState(true)

	const [sidebarWidth, setSidebarWidth] = useState(256)
	const [isDraggingSidebar, setIsDraggingSidebar] = useState(false)
	const [bottomHeight, setBottomHeight] = useState(256)
	const [isDraggingBottom, setIsDraggingBottom] = useState(false)

	const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['']))
	const [editState, setEditState] = useState<EditState>(null)
	const [dragOverPath, setDragOverPath] = useState<string | null>(null)
	const inputRef = useRef<HTMLInputElement>(null)

	const [editorLeft, setEditorLeft] = useState<any>(null)
	const [editorRight, setEditorRight] = useState<any>(null)
	const [monacoInstance, setMonacoInstance] = useState<any>(null)

	const [isSettingsOpen, setIsSettingsOpen] = useState(false)
	const [rootDirInput, setRootDirInput] = useState("")
	const [portInput, setPortInput] = useState(8000)

	// --- INITIALIZATION ---
	useEffect(() => {
		loadFiles();
		getAppConfig().then(config => {
			setRootDirInput(config.root_dir);
			if (config.port) setPortInput(config.port);
		});

		const lastFile = localStorage.getItem('grammarlot_last_file');
		if (lastFile) {
			handleOpenFile(lastFile).then(() => {
				// Auto-expand parent folders so the file is visible in the tree
				const parts = lastFile.split('/');
				const toExpand = new Set<string>(['']);
				let curr = "";
				for (let i = 0; i < parts.length - 1; i++) {
					curr = curr ? `${curr}/${parts[i]}` : parts[i];
					toExpand.add(curr);
				}
				setExpandedFolders(prev => new Set([...prev, ...toExpand]));
			});
		}
	}, []);

	// Save the active file to local storage whenever it changes
	useEffect(() => {
		const currentActive = activeFiles[focusedPane];
		if (currentActive) localStorage.setItem('grammarlot_last_file', currentActive);
		else localStorage.removeItem('grammarlot_last_file');
	}, [activeFiles, focusedPane]);

	useEffect(() => { fileTreeRef.current = fileTree; }, [fileTree]);

	useEffect(() => {
		if (editState && inputRef.current) {
			inputRef.current.focus();
			const val = inputRef.current.value;
			const dotIndex = val.lastIndexOf('.');
			if (dotIndex > 0 && editState.type === 'file') inputRef.current.setSelectionRange(0, dotIndex);
			else inputRef.current.select();
		}
	}, [editState]);

	// --- UI RESIZE LOGIC ---
	useEffect(() => {
		const handleMouseMove = (e: MouseEvent) => {
			if (isDraggingSidebar) setSidebarWidth(Math.min(Math.max(e.clientX, 150), 600));
			else if (isDraggingBottom) setBottomHeight(Math.min(Math.max(window.innerHeight - e.clientY, 100), window.innerHeight - 150));
			else if (isDraggingSplit) {
				const availableWidth = window.innerWidth - sidebarWidth;
				const offset = e.clientX - sidebarWidth;
				setSplitWidthRatio(Math.min(Math.max((offset / availableWidth) * 100, 10), 90));
			}
		};
		const handleMouseUp = () => {
			setIsDraggingSidebar(false); setIsDraggingBottom(false); setIsDraggingSplit(false);
			document.body.style.cursor = 'default'; document.body.style.userSelect = 'auto';
		};
		if (isDraggingSidebar || isDraggingBottom || isDraggingSplit) {
			document.addEventListener('mousemove', handleMouseMove);
			document.addEventListener('mouseup', handleMouseUp);
			if (isDraggingSidebar || isDraggingSplit) document.body.style.cursor = 'col-resize';
			if (isDraggingBottom) document.body.style.cursor = 'row-resize';
			document.body.style.userSelect = 'none';
		}
		return () => { document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', handleMouseUp); };
	}, [isDraggingSidebar, isDraggingBottom, isDraggingSplit, sidebarWidth]);

	// --- FILE SYSTEM API ACTIONS ---
	const loadFiles = async () => {
		try {
			const tree = await fetchFiles();

			// Recursive sort: directories first, then alphabetical
			const sortTree = (node: FileNode): FileNode => {
				if (!node.children) return node;
				return {
					...node,
					children: [...node.children].map(sortTree).sort((a, b) => {
						if (a.type === b.type) return a.name.localeCompare(b.name);
						return a.type === 'directory' ? -1 : 1;
					})
				};
			};

			const sortedTree = tree ? sortTree(tree) : null;

			setFileTree(sortedTree);
			if (sortedTree && sortedTree.path !== undefined) setExpandedFolders(prev => new Set(prev).add(sortedTree.path));
		} catch (error) { console.error(error); }
	};

	const handleSaveSettings = async () => {
		try {
			// Pass both variables as an object now
			await saveAppConfig({ root_dir: rootDirInput, port: Number(portInput) });
			setIsSettingsOpen(false);
			loadFiles();
			alert("Settings Saved! If you changed the Port, you MUST quit the app from the system tray and restart it for changes to take effect.");
		} catch (e) { alert("Failed to save settings."); }
	};

	const handleOpenFile = async (path: string) => {
		const existing = openFiles.find(f => f.path === path);
		if (existing) {
			setFocusedPane(existing.pane);
			setActiveFiles(prev => ({ ...prev, [existing.pane]: path }));
			return;
		}
		try {
			const content = await getFileContent(path);
			setOpenFiles(prev => {
				const next = [...prev];
				const unpinnedIndex = next.findIndex(f => !f.isPinned && f.pane === focusedPane);
				if (unpinnedIndex !== -1) {
					next[unpinnedIndex] = { path, isPinned: false, hasChanges: false, initialContent: content, pane: focusedPane };
				} else {
					next.push({ path, isPinned: false, hasChanges: false, initialContent: content, pane: focusedPane });
				}
				return next;
			});
			setActiveFiles(prev => ({ ...prev, [focusedPane]: path }));
		} catch (error) {
			console.error("Failed to open file:", error);
			if (localStorage.getItem('grammarlot_last_file') === path) localStorage.removeItem('grammarlot_last_file');
		}
	};

	const handleCloseTab = (e: React.MouseEvent, path: string, pane: 'left' | 'right') => {
		e.stopPropagation();
		const tab = openFiles.find(f => f.path === path && f.pane === pane);
		if (tab?.hasChanges && !window.confirm(`Discard unsaved changes in '${path}'?`)) return;

		setOpenFiles(prev => {
			const next = prev.filter(f => !(f.path === path && f.pane === pane));
			if (activeFiles[pane] === path) {
				const remainingInPane = next.filter(f => f.pane === pane);
				setActiveFiles(p => ({ ...p, [pane]: remainingInPane.length > 0 ? remainingInPane[remainingInPane.length - 1].path : null }));
			}
			return next;
		});
	};

	const togglePin = (e: React.MouseEvent, path: string) => {
		e.stopPropagation();
		setOpenFiles(prev => prev.map(f => f.path === path ? { ...f, isPinned: !f.isPinned } : f));
	};

	const splitTabToPane = (e: React.MouseEvent, path: string, targetPane: 'left' | 'right') => {
		e.stopPropagation();
		setOpenFiles(prev => prev.map(f => f.path === path ? { ...f, pane: targetPane } : f));
		setActiveFiles(prev => {
			const next = { ...prev };
			const sourcePane = targetPane === 'left' ? 'right' : 'left';
			if (next[sourcePane] === path) {
				const remaining = openFiles.filter(f => f.pane === sourcePane && f.path !== path);
				next[sourcePane] = remaining.length > 0 ? remaining[remaining.length - 1].path : null;
			}
			next[targetPane] = path;
			return next;
		});
		setFocusedPane(targetPane);
	};

	const handleSaveFile = async () => {
		const activePath = activeFiles[focusedPane];
		const editorInstance = focusedPane === 'left' ? editorLeft : editorRight;
		if (!activePath || !editorInstance) return;
		setIsSaving(true);
		try {
			const content = editorInstance.getValue();
			await saveFileContent(activePath, content);
			setOpenFiles(prev => prev.map(f => f.path === activePath ? { ...f, hasChanges: false } : f));
			loadFiles();
		}
		catch (error) { alert("Failed to save file!"); }
		finally { setIsSaving(false); }
	};

	const handleSaveFileRef = useRef(handleSaveFile);
	useEffect(() => { handleSaveFileRef.current = handleSaveFile; });

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
				e.preventDefault();
				handleSaveFileRef.current();
			}
		};
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, []);

	const handleDelete = async (e: React.MouseEvent, path: string) => {
		e.stopPropagation();
		if (!window.confirm(`Are you sure you want to delete '${path}'?`)) return;
		try {
			await deleteItem(path);
			setOpenFiles(prev => {
				const next = prev.filter(f => !(f.path === path || f.path.startsWith(path + '/')));
				setActiveFiles(p => ({
					left: !next.find(f => f.path === p.left) ? (next.filter(f => f.pane === 'left').pop()?.path || null) : p.left,
					right: !next.find(f => f.path === p.right) ? (next.filter(f => f.pane === 'right').pop()?.path || null) : p.right
				}));
				return next;
			});
			loadFiles();
		} catch (err) { alert("Failed to delete item."); }
	};

	const commitEdit = async (value: string) => {
		if (!editState || !value.trim()) { setEditState(null); return; }
		const val = value.trim();
		try {
			if (editState.mode === 'create') {
				const parentPrefix = editState.path ? `${editState.path}/` : "";
				let newPath = `${parentPrefix}${val}`;
				if (editState.type === 'file') {
					if (!newPath.endsWith('.txt')) newPath += '.txt';
					await saveFileContent(newPath, "");
					handleOpenFile(newPath);
				} else await createFolder(newPath);
			} else if (editState.mode === 'rename') {
				const parentPath = editState.path.includes('/') ? editState.path.substring(0, editState.path.lastIndexOf('/')) : "";
				const parentPrefix = parentPath ? `${parentPath}/` : "";
				let newPath = `${parentPrefix}${val}`;
				if (editState.type === 'file' && !newPath.endsWith('.txt')) newPath += '.txt';
				if (editState.path !== newPath) {
					await moveItem(editState.path, newPath);
					setOpenFiles(prev => prev.map(f => {
						if (f.path === editState.path) {
							const eInstance = f.pane === 'left' ? editorLeft : editorRight;
							return { ...f, path: newPath, initialContent: (activeFiles[f.pane] === editState.path && eInstance) ? eInstance.getValue() : f.initialContent };
						}
						if (f.path.startsWith(editState.path + '/')) return { ...f, path: f.path.replace(editState.path, newPath) };
						return f;
					}));
					setActiveFiles(p => ({
						left: p.left === editState.path || p.left?.startsWith(editState.path + '/') ? p.left.replace(editState.path, newPath) : p.left,
						right: p.right === editState.path || p.right?.startsWith(editState.path + '/') ? p.right.replace(editState.path, newPath) : p.right
					}));
				}
			}
			loadFiles();
		} catch (err) { alert("File operation failed."); }
		setEditState(null);
	};

	const handleDrop = async (e: React.DragEvent, targetPath: string, targetType: 'file' | 'directory') => {
		e.preventDefault(); e.stopPropagation(); setDragOverPath(null);
		const sourcePath = e.dataTransfer.getData('application/x-grammarlot-path');
		if (!sourcePath || sourcePath === targetPath) return;

		let destDir = targetPath;
		if (targetType === 'file') destDir = targetPath.includes('/') ? targetPath.substring(0, targetPath.lastIndexOf('/')) : "";
		const filename = sourcePath.split('/').pop();
		const destPrefix = destDir ? `${destDir}/` : "";
		const finalPath = `${destPrefix}${filename}`;
		if (sourcePath === finalPath) return;

		try {
			await moveItem(sourcePath, finalPath);
			setOpenFiles(prev => prev.map(f => {
				if (f.path === sourcePath) {
					const eInstance = f.pane === 'left' ? editorLeft : editorRight;
					return { ...f, path: finalPath, initialContent: (activeFiles[f.pane] === sourcePath && eInstance) ? eInstance.getValue() : f.initialContent };
				}
				if (f.path.startsWith(sourcePath + '/')) return { ...f, path: f.path.replace(sourcePath, finalPath) };
				return f;
			}));
			setActiveFiles(p => ({
				left: p.left === sourcePath || p.left?.startsWith(sourcePath + '/') ? p.left.replace(sourcePath, finalPath) : p.left,
				right: p.right === sourcePath || p.right?.startsWith(sourcePath + '/') ? p.right.replace(sourcePath, finalPath) : p.right
			}));
			loadFiles();
		} catch (err) { alert("Failed to move item."); }
	};

	const handleGenerate = async () => {
		const activeEditor = focusedPane === 'left' ? editorLeft : editorRight;
		if (!activeEditor) return;
		const content = activeEditor.getValue();
		if (!content.trim()) return;
		setIsLoading(true);
		try {
			const data = await generateText(content, isCleanOutput);
			setOutput(data.result); setTraceLogs(data.trace || []); setActiveTab("output");
		} catch (error) { setOutput("Error: Could not connect to the Grammarlot server."); }
		finally { setIsLoading(false); }
	};

	// --- MONACO SETUP & LINTING ---
	const getLatestFilePaths = () => {
		const traverse = (nodes?: FileNode[]): string[] => {
			let paths: string[] = [];
			if (!nodes) return paths;
			for (const node of nodes) {
				if (node.type === 'file') paths.push(node.path);
				if (node.children) paths.push(...traverse(node.children));
			}
			return paths;
		};
		return traverse(fileTreeRef.current?.children);
	};

	useEffect(() => {
		if (editorLeft && monacoInstance && activeFiles.left) validateParsifalCode(editorLeft, monacoInstance);
	}, [activeFiles.left, editorLeft, monacoInstance]);

	useEffect(() => {
		if (editorRight && monacoInstance && activeFiles.right) validateParsifalCode(editorRight, monacoInstance);
	}, [activeFiles.right, editorRight, monacoInstance]);

	// --- RENDERING ---
	const renderInlineInput = (marginLevel: number) => (
		<div className="flex items-center gap-2 p-1" style={{ marginLeft: `${marginLevel}px` }}>
			{editState?.type === 'folder' ? <Folder size={14} className="text-gray-500" /> : <FileText size={14} className="text-gray-500" />}
			<input ref={inputRef} className="flex-1 bg-[#222222] text-white outline-none border border-blue-500 px-1 text-sm rounded h-6" defaultValue={editState?.initialValue} onBlur={(e) => commitEdit(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(e.currentTarget.value); if (e.key === 'Escape') setEditState(null); }} />
		</div>
	);

	const renderFileNode = (node: FileNode, level: number = 0) => {
		const isEditingThis = editState?.mode === 'rename' && editState.path === node.path;
		const isExpanded = expandedFolders.has(node.path);
		const isDragOver = dragOverPath === node.path;
		const margin = level * 12;

		if (isEditingThis) return <div key={node.path}>{renderInlineInput(margin)}</div>;

		if (node.type === 'directory') {
			return (
				<div key={node.path}>
					<div draggable onDragStart={(e) => {
						e.dataTransfer.setData('application/x-grammarlot-path', node.path);
						e.dataTransfer.setData('text/plain', node.path);
					}} onDragOver={(e) => { e.preventDefault(); setDragOverPath(node.path); }} onDragLeave={() => setDragOverPath(null)} onDrop={(e) => handleDrop(e, node.path, 'directory')} onClick={() => setExpandedFolders(prev => { const next = new Set(prev); if (next.has(node.path)) next.delete(node.path); else next.add(node.path); return next; })} className={`group flex items-center justify-between p-1 cursor-pointer mt-0.5 select-none ${isDragOver ? 'bg-[#2A2A2A] outline outline-1 outline-blue-500 rounded' : 'hover:bg-[#222222] rounded'}`} style={{ paddingLeft: `${margin + 4}px` }}>
						<div className="flex items-center gap-1 flex-1 overflow-hidden">
							{isExpanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
							<Folder size={14} className={isExpanded ? "text-blue-400 shrink-0" : "text-gray-500 shrink-0"} />
							<span className="text-sm truncate text-gray-300 group-hover:text-white">{node.name}</span>
						</div>
						<div className="hidden group-hover:flex items-center gap-1.5 px-1 shrink-0 text-gray-400">
							<button className="hover:text-white" title="New File" onClick={(e) => { e.stopPropagation(); setExpandedFolders(p => new Set(p).add(node.path)); setEditState({ path: node.path, type: 'file', mode: 'create', initialValue: '' }); }}><FilePlus size={14} /></button>
							<button className="hover:text-white" title="New Folder" onClick={(e) => { e.stopPropagation(); setExpandedFolders(p => new Set(p).add(node.path)); setEditState({ path: node.path, type: 'folder', mode: 'create', initialValue: '' }); }}><FolderPlus size={14} /></button>
							<button className="hover:text-white" title="Rename" onClick={(e) => { e.stopPropagation(); setEditState({ path: node.path, type: 'folder', mode: 'rename', initialValue: node.name }); }}><Edit2 size={13} /></button>
							<button className="hover:text-red-400" title="Delete" onClick={(e) => handleDelete(e, node.path)}><Trash2 size={13} /></button>
						</div>
					</div>
					{isExpanded && <div>{editState?.mode === 'create' && editState.path === node.path && renderInlineInput(margin + 24)}{node.children?.map(child => renderFileNode(child, level + 1))}</div>}
				</div>
			);
		}

		const isActive = activeFiles.left === node.path || activeFiles.right === node.path;
		return (
			<div key={node.path} draggable onDragStart={(e) => {
				e.dataTransfer.setData('application/x-grammarlot-path', node.path);
				e.dataTransfer.setData('text/plain', node.path);
			}} onDragOver={(e) => { e.preventDefault(); setDragOverPath(node.path); }} onDragLeave={() => setDragOverPath(null)} onDrop={(e) => handleDrop(e, node.path, 'file')} onClick={() => handleOpenFile(node.path)} className={`group flex items-center justify-between p-1 cursor-pointer rounded mb-0.5 select-none ${isActive ? 'bg-[#2A2A2A] text-white' : 'text-gray-400 hover:bg-[#222222] hover:text-gray-200'} ${isDragOver ? 'outline outline-1 outline-blue-500' : ''}`} style={{ paddingLeft: `${margin + 20}px` }}>
				<div className="flex items-center gap-1.5 flex-1 overflow-hidden">
					<FileText size={14} className={isActive ? "text-blue-400 shrink-0" : "text-gray-500 shrink-0"} />
					<span className="truncate text-sm">{node.name}</span>
				</div>
				<div className="hidden group-hover:flex items-center gap-2 px-1 shrink-0 text-gray-400">
					<button className="hover:text-white" title="Rename" onClick={(e) => { e.stopPropagation(); setEditState({ path: node.path, type: 'file', mode: 'rename', initialValue: node.name }); }}><Edit2 size={13} /></button>
					<button className="hover:text-red-400" title="Delete" onClick={(e) => handleDelete(e, node.path)}><Trash2 size={13} /></button>
				</div>
			</div>
		);
	};

	return (
		<div className="flex h-screen bg-[#0C0C0C] text-gray-300 font-sans overflow-hidden">
			{(isDraggingSidebar || isDraggingBottom) && <div className="fixed inset-0 z-50" style={{ cursor: isDraggingSidebar ? 'col-resize' : 'row-resize' }} />}

			{/* SETTINGS MODAL */}
			{isSettingsOpen && (
				<div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[100]">
					<div className="bg-[#141414] border border-[#2A2A2A] p-6 rounded-lg shadow-2xl w-96">
						<h2 className="text-white font-bold mb-4 flex items-center gap-2"><Settings size={18} /> Grammarlot Settings</h2>
						<div className="mb-4">
							<label className="block text-xs text-gray-400 mb-1">Root Prompts Directory (Absolute Path)</label>
							<input type="text" className="w-full bg-[#0C0C0C] text-white border border-[#2A2A2A] rounded px-3 py-2 outline-none focus:border-blue-500 text-sm" placeholder="e.g. D:\AI\Prompts" value={rootDirInput} onChange={(e) => setRootDirInput(e.target.value)} />
							<p className="text-[10px] text-gray-500 mt-1">This folder contains all your parsifal scripts.</p>
						</div>
						<div className="mb-4">
							<label className="block text-xs text-gray-400 mb-1">Server Port</label>
							<input type="number" className="w-full bg-[#0C0C0C] text-white border border-[#2A2A2A] rounded px-3 py-2 outline-none focus:border-blue-500 text-sm" value={portInput} onChange={(e) => setPortInput(Number(e.target.value))} />
							<p className="text-[10px] text-gray-500 mt-1">Requires an app restart to take effect.</p>
						</div>
						<div className="flex justify-end gap-2 mt-6">
							<button className="px-4 py-2 rounded text-sm text-gray-300 hover:bg-[#222222]" onClick={() => setIsSettingsOpen(false)}>Cancel</button>
							<button className="px-4 py-2 rounded text-sm bg-blue-600 hover:bg-blue-500 text-white font-bold" onClick={handleSaveSettings}>Save & Reload</button>
						</div>
					</div>
				</div>
			)}

			{/* LEFT SIDEBAR */}
			<div className="border-r border-[#2A2A2A] bg-[#141414] flex flex-col flex-shrink-0 relative group/sidebar" style={{ width: sidebarWidth }}>
				<div className="h-12 shrink-0 px-3 border-b border-[#2A2A2A] flex items-center justify-between">
					<div className="font-bold text-gray-400 text-xs tracking-wider flex items-center gap-2 select-none">
						<Folder size={14} /> EXPLORER
						<span className="ml-1 text-[10px] text-gray-600 font-normal mt-0.5">{import.meta.env.VITE_APP_VERSION || 'Local Dev'}</span>
						<button className="ml-2 hover:text-white transition-colors flex items-center" title="Settings" onClick={() => setIsSettingsOpen(true)}><Settings size={13} /></button>
					</div>
					<div className="hidden group-hover/sidebar:flex items-center gap-2 text-gray-400">
						<button className="hover:text-white cursor-pointer" title="New File at Root" onClick={() => setEditState({ path: "", type: 'file', mode: 'create', initialValue: '' })}><FilePlus size={15} /></button>
						<button className="hover:text-white cursor-pointer" title="New Folder at Root" onClick={() => setEditState({ path: "", type: 'folder', mode: 'create', initialValue: '' })}><FolderPlus size={15} /></button>
					</div>
				</div>
				<div className="p-2 flex-1 overflow-y-auto custom-scrollbar" onDragOver={(e) => { e.preventDefault(); if (e.target === e.currentTarget) setDragOverPath(""); }} onDragLeave={(e) => { if (e.target === e.currentTarget) setDragOverPath(null); }} onDrop={(e) => handleDrop(e, "", 'directory')}>
					{fileTree ? (
						<>
							{editState?.mode === 'create' && editState.path === "" && renderInlineInput(4)}
							{fileTree.children?.length === 0 && !editState ? <div className="text-xs text-gray-500 p-2">Workspace is empty.</div> : fileTree.children?.map(node => renderFileNode(node))}
						</>
					) : <div className="text-xs text-gray-500 p-2 flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Loading...</div>}
				</div>
				<div className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500 z-10 transition-colors" onMouseDown={() => setIsDraggingSidebar(true)} />
			</div>

			{/* CENTER & BOTTOM */}
			<div className="flex-1 flex flex-col min-w-0">

				{/* GLOBAL TOP BAR */}
				<div className="h-10 shrink-0 bg-[#141414] border-b border-[#2A2A2A] flex items-center justify-between px-4">
					<div className="text-gray-500 text-xs font-bold uppercase tracking-wider flex items-center gap-2 select-none">
						{activeFiles[focusedPane] ? <><span className="text-blue-500">Active:</span> {activeFiles[focusedPane]}</> : "No File Focused"}
					</div>
					<div className="flex items-center gap-4 shrink-0">
						<label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer select-none hover:text-gray-200"><input type="checkbox" className="w-4 h-4 rounded bg-[#0C0C0C] border-gray-600 text-blue-500 accent-blue-500 cursor-pointer" checked={isCleanOutput} onChange={(e) => setIsCleanOutput(e.target.checked)} /> Clean Output</label>
						<button className="flex items-center gap-2 bg-[#222222] hover:bg-[#2A2A2A] text-white px-3 py-1 rounded text-sm transition disabled:opacity-50 border border-[#2A2A2A]" onClick={handleSaveFile} disabled={!activeFiles[focusedPane] || (!openFiles.find(f => f.path === activeFiles[focusedPane])?.hasChanges && !isSaving)}>{isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} SAVE</button>
						<button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-1 rounded text-sm font-bold transition disabled:opacity-50 shadow-lg shadow-blue-900/20" onClick={handleGenerate} disabled={isLoading || !activeFiles[focusedPane]}>{isLoading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} GENERATE</button>
					</div>
				</div>

				{/* SPLIT PANES */}
				<div className="flex-1 flex relative min-h-0 bg-[#0C0C0C]">

					{/* LEFT PANE */}
					<div className="flex flex-col h-full" style={{ width: openFiles.some(f => f.pane === 'right') ? `${splitWidthRatio}%` : '100%' }} onClickCapture={() => { if (focusedPane !== 'left') setFocusedPane('left'); }}>
						<div className="h-10 shrink-0 bg-[#1A1A1A] border-b border-[#2A2A2A] flex items-end px-2 overflow-x-auto custom-scrollbar">
							{openFiles.filter(f => f.pane === 'left').map(file => {
								const isActive = activeFiles.left === file.path;
								return (
									<div key={file.path} onClick={() => setActiveFiles(p => ({ ...p, left: file.path }))} className={`group flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer select-none border-t-2 rounded-t-md mx-0.5 transition-colors ${isActive ? (focusedPane === 'left' ? 'bg-[#0C0C0C] text-blue-400 border-blue-500' : 'bg-[#0C0C0C] text-gray-300 border-gray-600') : 'bg-[#141414] text-gray-500 border-transparent hover:bg-[#222222]'}`}>
										<span className={!file.isPinned && !isActive ? 'italic' : ''}>{file.path.split('/').pop()}</span>
										<div className="flex items-center gap-1">
											{file.hasChanges && <span className="w-2 h-2 rounded-full bg-white shrink-0"></span>}
											<button onClick={(e) => splitTabToPane(e, file.path, 'right')} className="shrink-0 p-0.5 rounded hover:bg-[#333333] text-transparent group-hover:text-gray-500" title="Split Right"><Columns size={12} /></button>
											<button onClick={(e) => togglePin(e, file.path)} className={`shrink-0 p-0.5 rounded hover:bg-[#333333] ${file.isPinned ? 'text-blue-500' : 'text-transparent group-hover:text-gray-500'}`} title="Pin Tab"><Pin size={12} /></button>
											<button onClick={(e) => handleCloseTab(e, file.path, 'left')} className="shrink-0 p-0.5 rounded hover:bg-[#333333] text-gray-500 hover:text-white" title="Close"><X size={14} /></button>
										</div>
									</div>
								);
							})}
						</div>
						<div className="flex-1 relative" onDropCapture={(e) => {
							const path = e.dataTransfer.getData('application/x-grammarlot-path');
							if (path && editorLeft && monacoInstance) {
								e.preventDefault(); e.stopPropagation();
								const target = editorLeft.getTargetAtClientPoint(e.clientX, e.clientY);
								if (target?.position) {
									editorLeft.executeEdits("dnd", [{ range: new monacoInstance.Range(target.position.lineNumber, target.position.column, target.position.lineNumber, target.position.column), text: `[file name="${path}"]` }]);
									editorLeft.focus();
								}
							}
						}}>
							{activeFiles.left ? (() => {
								const activeTabData = openFiles.find(f => f.path === activeFiles.left && f.pane === 'left');
								return (
									<Editor key={`editor-left`} height="100%" language="parsifal" theme="parsifal-dark" path={activeFiles.left} defaultValue={activeTabData?.initialContent}
										onChange={() => {
											setOpenFiles(prev => prev.map(f => f.path === activeFiles.left && f.pane === 'left' ? { ...f, hasChanges: true, isPinned: true } : f));
											if (editorLeft && monacoInstance) validateParsifalCode(editorLeft, monacoInstance);
										}}
										beforeMount={(m) => setupParsifalLanguage(m, getLatestFilePaths)}
										onMount={(editor, m) => { setEditorLeft(editor); setMonacoInstance(m); editor.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyS, () => handleSaveFileRef.current()); }}
										options={{ minimap: { enabled: false }, wordWrap: 'on', fontSize: 14, padding: { top: 16 } }} />
								);
							})() : <div className="absolute inset-0 flex items-center justify-center text-gray-600 select-none">No active file</div>}
						</div>
					</div>

					{/* RESIZER & RIGHT PANE (Conditional) */}
					{openFiles.some(f => f.pane === 'right') && (
						<>
							<div className="w-[4px] -ml-[2px] z-10 cursor-col-resize hover:bg-blue-500 transition-colors bg-[#2A2A2A]" onMouseDown={() => setIsDraggingSplit(true)} />
							<div className="flex flex-col h-full flex-1 min-w-0" onClickCapture={() => { if (focusedPane !== 'right') setFocusedPane('right'); }}>
								<div className="h-10 shrink-0 bg-[#1A1A1A] border-b border-[#2A2A2A] flex items-end px-2 overflow-x-auto custom-scrollbar">
									{openFiles.filter(f => f.pane === 'right').map(file => {
										const isActive = activeFiles.right === file.path;
										return (
											<div key={file.path} onClick={() => setActiveFiles(p => ({ ...p, right: file.path }))} className={`group flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer select-none border-t-2 rounded-t-md mx-0.5 transition-colors ${isActive ? (focusedPane === 'right' ? 'bg-[#0C0C0C] text-blue-400 border-blue-500' : 'bg-[#0C0C0C] text-gray-300 border-gray-600') : 'bg-[#141414] text-gray-500 border-transparent hover:bg-[#222222]'}`}>
												<span className={!file.isPinned && !isActive ? 'italic' : ''}>{file.path.split('/').pop()}</span>
												<div className="flex items-center gap-1">
													{file.hasChanges && <span className="w-2 h-2 rounded-full bg-white shrink-0"></span>}
													<button onClick={(e) => splitTabToPane(e, file.path, 'left')} className="shrink-0 p-0.5 rounded hover:bg-[#333333] text-transparent group-hover:text-gray-500" title="Split Left"><Columns size={12} /></button>
													<button onClick={(e) => togglePin(e, file.path)} className={`shrink-0 p-0.5 rounded hover:bg-[#333333] ${file.isPinned ? 'text-blue-500' : 'text-transparent group-hover:text-gray-500'}`} title="Pin Tab"><Pin size={12} /></button>
													<button onClick={(e) => handleCloseTab(e, file.path, 'right')} className="shrink-0 p-0.5 rounded hover:bg-[#333333] text-gray-500 hover:text-white" title="Close"><X size={14} /></button>
												</div>
											</div>
										);
									})}
								</div>
								<div className="flex-1 relative" onDropCapture={(e) => {
									const path = e.dataTransfer.getData('application/x-grammarlot-path');
									if (path && editorRight && monacoInstance) {
										e.preventDefault(); e.stopPropagation();
										const target = editorRight.getTargetAtClientPoint(e.clientX, e.clientY);
										if (target?.position) {
											editorRight.executeEdits("dnd", [{ range: new monacoInstance.Range(target.position.lineNumber, target.position.column, target.position.lineNumber, target.position.column), text: `[file name="${path}"]` }]);
											editorRight.focus();
										}
									}
								}}>
									{activeFiles.right ? (() => {
										const activeTabData = openFiles.find(f => f.path === activeFiles.right && f.pane === 'right');
										return (
											<Editor key={`editor-right`} height="100%" language="parsifal" theme="parsifal-dark" path={activeFiles.right} defaultValue={activeTabData?.initialContent}
												onChange={() => {
													setOpenFiles(prev => prev.map(f => f.path === activeFiles.right && f.pane === 'right' ? { ...f, hasChanges: true, isPinned: true } : f));
													if (editorRight && monacoInstance) validateParsifalCode(editorRight, monacoInstance);
												}}
												beforeMount={(m) => setupParsifalLanguage(m, getLatestFilePaths)}
												onMount={(editor, m) => { setEditorRight(editor); setMonacoInstance(m); editor.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyS, () => handleSaveFileRef.current()); }}
												options={{ minimap: { enabled: false }, wordWrap: 'on', fontSize: 14, padding: { top: 16 } }} />
										);
									})() : <div className="absolute inset-0 flex items-center justify-center text-gray-600 select-none">No active file</div>}
								</div>
							</div>
						</>
					)}
				</div>

				<div className="bg-[#0C0C0C] flex flex-col flex-shrink-0 relative border-t border-[#2A2A2A]" style={{ height: bottomHeight }}>
					<div className="absolute top-0 left-0 w-full h-[4px] -mt-[2px] cursor-row-resize hover:bg-blue-500 z-10 transition-colors" onMouseDown={() => setIsDraggingBottom(true)} />
					<div className="flex border-b border-[#2A2A2A] text-xs uppercase tracking-wider select-none shrink-0 bg-[#141414]">
						<div className={`px-4 py-2 cursor-pointer ${activeTab === 'output' ? 'border-b-2 border-blue-500 text-blue-400 bg-[#0C0C0C]' : 'text-gray-500 hover:text-gray-300'}`} onClick={() => setActiveTab('output')}>Output</div>
						<div className={`px-4 py-2 cursor-pointer ${activeTab === 'trace' ? 'border-b-2 border-blue-500 text-blue-400 bg-[#0C0C0C]' : 'text-gray-500 hover:text-gray-300'}`} onClick={() => setActiveTab('trace')}>Trace Logs ({traceLogs.length})</div>
					</div>
					<div className="p-4 flex-1 overflow-y-auto font-mono text-sm custom-scrollbar">
						{activeTab === 'output' && <div className="text-green-400 whitespace-pre-wrap">{output || "> Ready..."}</div>}
						{activeTab === 'trace' && (
							<div className="text-gray-400 space-y-0">
								{traceLogs.length === 0 ? "> No trace logs available..." : traceLogs.map((log, i) => (
									<div key={i} className="flex flex-col border-b border-[#2A2A2A] py-2">
										<div className="flex gap-4 items-start"><span className="text-amber-500 w-24 flex-shrink-0 font-bold">[{log.action}]</span><span className="flex-1 text-gray-300">{log.details}</span></div>
										{log.meta && Object.keys(log.meta).length > 0 && <div className="ml-28 mt-1 text-gray-400 text-xs break-all bg-[#141414] p-2 rounded border border-[#2A2A2A]">{JSON.stringify(log.meta)}</div>}
									</div>
								))
								}
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	)
}

export default App