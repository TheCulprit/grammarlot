import { useState, useEffect, useRef } from 'react'
import { Play, Folder, FileText, Loader2, Save, ChevronRight, ChevronDown, Trash2, Edit2, FolderPlus, FilePlus, Settings } from 'lucide-react'
import Editor from '@monaco-editor/react'
import { generateText, fetchFiles, getFileContent, saveFileContent, deleteItem, createFolder, moveItem, getAppConfig, saveAppConfig } from './api'
import { setupParsifalLanguage, validateParsifalCode } from './parsifalLanguage'
import packageJson from '../package.json'

type FileNode = { name: string; type: "file" | "directory"; path: string; children?: FileNode[]; };
type EditState = { path: string; type: 'file' | 'folder'; mode: 'create' | 'rename'; initialValue: string; } | null;

function App() {
  const [fileTree, setFileTree] = useState<FileNode | null>(null)
  const fileTreeRef = useRef<FileNode | null>(null) // Used to feed latest files to Monaco Autocomplete
  
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [editorContent, setEditorContent] = useState("")
  const [hasChanges, setHasChanges] = useState(false)
  
  const [output, setOutput] = useState("")
  const[traceLogs, setTraceLogs] = useState<any[]>([ ])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const[activeTab, setActiveTab] = useState<"output" | "trace">("output")
  const[isCleanOutput, setIsCleanOutput] = useState(true)

  const [sidebarWidth, setSidebarWidth] = useState(256)
  const [isDraggingSidebar, setIsDraggingSidebar] = useState(false)
  const[bottomHeight, setBottomHeight] = useState(256)
  const[isDraggingBottom, setIsDraggingBottom] = useState(false)
  
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['']))
  const [editState, setEditState] = useState<EditState>(null)
  const [dragOverPath, setDragOverPath] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [editorInstance, setEditorInstance] = useState<any>(null)
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
  }, [ ]);

  // Save the active file to local storage whenever it changes
  useEffect(() => { 
    if (activeFile) localStorage.setItem('grammarlot_last_file', activeFile);
    else localStorage.removeItem('grammarlot_last_file');
  }, [activeFile]);

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
    };
    const handleMouseUp = () => {
      setIsDraggingSidebar(false); setIsDraggingBottom(false);
      document.body.style.cursor = 'default'; document.body.style.userSelect = 'auto';
    };
    if (isDraggingSidebar || isDraggingBottom) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = isDraggingSidebar ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
    }
    return () => { document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', handleMouseUp); };
  }, [isDraggingSidebar, isDraggingBottom]);

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
    if (hasChanges && activeFile !== path && !window.confirm("You have unsaved changes. Discard them?")) return;
    try {
      const content = await getFileContent(path);
      setActiveFile(path); setEditorContent(content); setHasChanges(false);
    } catch (error) { 
      console.error("Failed to open file:", error);
      // If we tried to open a file that no longer exists (e.g. from local storage), clean up
      if (localStorage.getItem('grammarlot_last_file') === path) {
        localStorage.removeItem('grammarlot_last_file');
      }
    }
  };

  const handleSaveFile = async () => {
    if (!activeFile) return;
    setIsSaving(true);
    try { await saveFileContent(activeFile, editorContent); setHasChanges(false); loadFiles(); } 
    catch (error) { alert("Failed to save file!"); } 
    finally { setIsSaving(false); }
  };

  // Keep a ref to the latest save function so the keyboard shortcut always saves the newest text
  const handleSaveFileRef = useRef(handleSaveFile);
  useEffect(() => { handleSaveFileRef.current = handleSaveFile; });
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault(); // Stop the browser from opening the "Save Webpage" dialog
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
      if (activeFile === path || activeFile?.startsWith(path + '/')) { setActiveFile(null); setEditorContent(""); setHasChanges(false); }
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
          setActiveFile(newPath); setEditorContent(""); setHasChanges(false);
        } else await createFolder(newPath);
      } else if (editState.mode === 'rename') {
        const parentPath = editState.path.includes('/') ? editState.path.substring(0, editState.path.lastIndexOf('/')) : "";
        const parentPrefix = parentPath ? `${parentPath}/` : "";
        let newPath = `${parentPrefix}${val}`;
        if (editState.type === 'file' && !newPath.endsWith('.txt')) newPath += '.txt';
        if (editState.path !== newPath) { await moveItem(editState.path, newPath); if (activeFile === editState.path) setActiveFile(newPath); }
      }
      loadFiles();
    } catch (err) { alert("File operation failed."); }
    setEditState(null);
  };

  const handleDrop = async (e: React.DragEvent, targetPath: string, targetType: 'file' | 'directory') => {
    e.preventDefault(); e.stopPropagation(); setDragOverPath(null);
    
    // Read from our custom type so text dragging from outside doesn't crash the file explorer
    const sourcePath = e.dataTransfer.getData('application/x-grammarlot-path');
    if (!sourcePath || sourcePath === targetPath) return;

    let destDir = targetPath;
    if (targetType === 'file') destDir = targetPath.includes('/') ? targetPath.substring(0, targetPath.lastIndexOf('/')) : "";
    
    const filename = sourcePath.split('/').pop();
    const destPrefix = destDir ? `${destDir}/` : "";
    const finalPath = `${destPrefix}${filename}`;
    if (sourcePath === finalPath) return;

    try { await moveItem(sourcePath, finalPath); if (activeFile === sourcePath) setActiveFile(finalPath); loadFiles(); } 
    catch (err) { alert("Failed to move item."); }
  };

  const handleGenerate = async () => {
    if (!editorContent.trim()) return;
    setIsLoading(true);
    try {
      const data = await generateText(editorContent, isCleanOutput);
      setOutput(data.result); setTraceLogs(data.trace || [ ]); setActiveTab("output");
    } catch (error) { setOutput("Error: Could not connect to the Grammarlot server."); } 
    finally { setIsLoading(false); }
  };

  // --- MONACO SETUP & LINTING ---
  const getLatestFilePaths = () => {
    const traverse = (nodes?: FileNode[]): string[] => {
      let paths: string[] = [ ];
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
    if (editorInstance && monacoInstance) validateParsifalCode(editorInstance, monacoInstance);
  }, [editorContent, editorInstance, monacoInstance]);

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

    const isActive = activeFile === node.path;
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
        <div className="h-12 shrink-0 bg-[#141414] border-b border-[#2A2A2A] flex items-center justify-between px-4">
          <div className="flex space-x-1 flex-1 overflow-x-auto custom-scrollbar">
            {activeFile ? <div className="px-3 py-1 bg-[#0C0C0C] text-blue-400 text-sm border-t-2 border-blue-500 flex items-center gap-2 select-none">{activeFile} {hasChanges && <span className="w-2 h-2 rounded-full bg-white"></span>}</div> : <div className="text-gray-500 text-sm italic select-none">No file open</div>}
          </div>
          <div className="flex items-center gap-4 shrink-0 pl-4">
            <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer select-none hover:text-gray-200"><input type="checkbox" className="w-4 h-4 rounded bg-[#0C0C0C] border-gray-600 text-blue-500 accent-blue-500 cursor-pointer" checked={isCleanOutput} onChange={(e) => setIsCleanOutput(e.target.checked)} /> Clean Output</label>
            <button className="flex items-center gap-2 bg-[#222222] hover:bg-[#2A2A2A] text-white px-3 py-1.5 rounded text-sm transition disabled:opacity-50 border border-[#2A2A2A]" onClick={handleSaveFile} disabled={!activeFile || (!hasChanges && !isSaving)}>{isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} SAVE</button>
            <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded text-sm font-bold transition disabled:opacity-50 shadow-lg shadow-blue-900/20" onClick={handleGenerate} disabled={isLoading || !editorContent}>{isLoading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} GENERATE</button>
          </div>
        </div>

        <div 
          className="flex-1 relative min-h-0 bg-[#0C0C0C]"
          onDropCapture={(e) => {
            const path = e.dataTransfer.getData('application/x-grammarlot-path');
            if (path && editorInstance && monacoInstance) {
              e.target.dispatchEvent(new DragEvent('dragleave', { bubbles: true }));
              e.preventDefault();
              e.stopPropagation(); 
              
              const target = editorInstance.getTargetAtClientPoint(e.clientX, e.clientY);
              if (target?.position) {
                editorInstance.executeEdits("dnd", [{
                  range: new monacoInstance.Range(
                    target.position.lineNumber, 
                    target.position.column, 
                    target.position.lineNumber, 
                    target.position.column
                  ),
                  text: `[file name="${path}"]`
                }]);
                editorInstance.focus();
              }
            }
          }}
        >
          {activeFile ? (
            <Editor height="100%" language="parsifal" theme="parsifal-dark" value={editorContent}
              onChange={(val) => { setEditorContent(val || ""); setHasChanges(true); }}
              beforeMount={(monaco) => setupParsifalLanguage(monaco, getLatestFilePaths)}
              onMount={(editor, monaco) => { 
                setEditorInstance(editor); 
                setMonacoInstance(monaco); 
                editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
                  handleSaveFileRef.current();
                });
              }}
              options={{ minimap: { enabled: false }, wordWrap: 'on', fontSize: 14, padding: { top: 16 } }} />
          ) : <div className="absolute inset-0 flex items-center justify-center text-gray-500 select-none bg-[#0C0C0C]">Select a file from the explorer or create a new one to start writing.</div>}
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