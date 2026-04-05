export const CONTAINERS =[ "register", "intercept", "set", "override", "calc", "if", "elseif", "else", "switch", "case", "default", "weighted", "w", "loop", "def", "ran", "shuffle", "join", "chance", "len", "comment", "ignore", "mute", "rw", "irw", "#" ];
export const STANDALONE =[ "pass", "library", "select", "count", "query", "file", "wildcard", "all", "get", "inc", "dec", "exists", "contains", "log", "stop", "break", "range", "call" ];

// Map commands to their valid arguments
const COMMAND_ARGS: Record<string, string[]> = {
  select:[ "tags", "required", "any", "exclude", "var", "prefer" ],
  file: [ "name", "recursive" ],
  wildcard: [ "name" ],
  library: [ "dir", "recursive" ],
  all:[ "dir", "recursive" ],
  query: [ "required", "any", "exclude", "sep" ],
  count:[ "required", "any", "exclude" ],
  set: [ "name" ],
  override:[ "name" ],
  contains: [ "val" ],
  get: [ "var" ],
  def: [ "name" ],
  call: [ "name" ],
  loop:[ "count" ],
  ran: [ "count" ],
  chance: [ "value" ],
  join:[ "sep" ],
  shuffle: [ "sep" ],
  switch: [ "var" ],
  w: [ "weight", "w" ],
  range: [ "min", "max" ],
};

let isLanguageRegistered = false;

export const setupParsifalLanguage = (monaco: any, getFilePaths: () => string[]) => {
  if (isLanguageRegistered) return;
  isLanguageRegistered = true;

  monaco.languages.register({ id: 'parsifal' });

  // --- SMART AUTOCOMPLETE ---
  monaco.languages.registerCompletionItemProvider('parsifal', {
    triggerCharacters:['[', '/', ' ', '"', "'", "="],
    provideCompletionItems: (model: any, position: any) => {
      const textUntilCursor = model.getValueInRange({
        startLineNumber: position.lineNumber, startColumn: 1,
        endLineNumber: position.lineNumber, endColumn: position.column
      });
      
      const wordInfo = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber, endLineNumber: position.lineNumber,
        startColumn: wordInfo.startColumn, endColumn: wordInfo.endColumn
      };

      // Find the last unclosed bracket before the cursor
      const tagMatch = textUntilCursor.match(/\[(\/?)([a-zA-Z0-9_#]*)([^\[\]]*)$/);
      if (!tagMatch) return { suggestions: [ ] };
      
      const isClosing = tagMatch[1] === '/';
      const command = tagMatch[2];
      const rest = tagMatch[3];

      const suggestions: any[] =[ ];

      // STATE 1: Suggesting Closing Tags
      if (isClosing) {
        CONTAINERS.forEach(cmd => {
          suggestions.push({ label: cmd, kind: monaco.languages.CompletionItemKind.Event, insertText: `${cmd}]`, detail: `Close Container`, range });
        });
        return { suggestions };
      }

      // STATE 2: Suggesting Commands (Typing right after the bracket)
      if (rest === '' || !rest.match(/\s/)) {
        CONTAINERS.forEach(cmd => suggestions.push({ label: cmd, kind: monaco.languages.CompletionItemKind.Class, insertText: cmd, detail: `Container Tag`, range }));
        STANDALONE.forEach(cmd => suggestions.push({ label: cmd, kind: monaco.languages.CompletionItemKind.Function, insertText: cmd, detail: `Standalone Tag`, range }));
        return { suggestions };
      }

      // STATE 3: Suggesting File Paths (Inside quotes for named arguments)
      const valueMatch = rest.match(/([a-zA-Z_]+)=["']([^"']*)$/);
      if (valueMatch) {
        const argName = valueMatch[1];
        if (['file', 'wildcard', 'library', 'all'].includes(command) &&['name', 'dir'].includes(argName)) {
          getFilePaths().forEach(p => {
            suggestions.push({ label: p, kind: monaco.languages.CompletionItemKind.File, insertText: p, detail: "Workspace File", range });
          });
        }
        // Always return here to prevent suggesting argument names inside quotes
        return { suggestions };
      }

      // STATE 4: Suggesting File Paths (As a positional argument)
      // This matches if we are typing the VERY FIRST argument and there is no equals sign
      const positionalMatch = rest.match(/^\s+([^=\s]*)$/);
      if (positionalMatch &&['file', 'wildcard', 'library', 'all'].includes(command)) {
        getFilePaths().forEach(p => {
          suggestions.push({ label: p, kind: monaco.languages.CompletionItemKind.File, insertText: p, detail: "Workspace File", range });
        });
        // We do NOT return here, so it falls through and ALSO suggests argument names!
      }

      // STATE 5: Suggesting Arguments (After a space, outside of quotes)
      const typingArgNameMatch = rest.match(/\s+([^=\s]*)$/);
      if (typingArgNameMatch && COMMAND_ARGS[command]) {
        COMMAND_ARGS[command].forEach(arg => {
          suggestions.push({ label: arg, kind: monaco.languages.CompletionItemKind.Property, insertText: `${arg}="`, detail: "Argument", range });
        });
      }

      return { suggestions };
    }
  });

  // --- TOKENIZER & THEME ---
  monaco.languages.setMonarchTokensProvider('parsifal', {
    tokenizer: {
      root: [[/\[#(?=[\s\]])/, { token: 'comment', next: '@comment_hash' }],
        [/\[comment(?=[\s\]])/, { token: 'comment', next: '@comment_word' }],
        [/(\[\/?)([a-zA-Z0-9_#]+)/,['delimiter.bracket', { token: 'keyword', next: '@tag_inside' }]],
        [/\[\/?/, { token: 'delimiter.bracket', next: '@tag_inside' }],
        [/\]/, 'invalid'],
        [/[^\[\]]+/, 'text']
      ],
      comment_hash: [ [/(.*?)(\[\/#\])/, ['comment', { token: 'comment', next: '@pop' }]], [/.+/, 'comment'] ],
      comment_word: [ [/(.*?)(\[\/comment\])/,['comment', { token: 'comment', next: '@pop' }]], [/.+/, 'comment'] ],
      tag_inside:[
        [/(\[\/?)([a-zA-Z0-9_#]+)/,['delimiter.bracket', { token: 'keyword', next: '@push' }]],
        [/\[\/?/, { token: 'delimiter.bracket', next: '@push' }],
        [/\]/, { token: 'delimiter.bracket', next: '@pop' }],
        [/[a-zA-Z_]+(?=\=)/, 'argument'], [/=/, 'delimiter.equals'],
        [/"([^"\\]|\\.)*"/, 'variable'], [/'([^'\\]|\\.)*'/, 'variable'],
        [/[^\[\]\s="']+/, 'variable'], [/[ \t\r\n]+/, 'white']
      ]
    }
  });

  monaco.editor.defineTheme('parsifal-dark', {
    base: 'vs-dark', inherit: true,
    rules:[
      { token: 'comment', foreground: '6a9955', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'c586c0', fontStyle: 'bold' },
      { token: 'delimiter.bracket', foreground: '808080' },
      { token: 'argument', foreground: '22d3ee' },
      { token: 'variable', foreground: 'fb923c' },
      { token: 'delimiter.equals', foreground: '808080' },
      { token: 'invalid', foreground: 'ef4444', fontStyle: 'bold' },
      { token: 'text', foreground: 'd4d4d4' }
    ],
    colors: { 'editor.background': '#1e1e1e' }
  });
};

// --- LINTER ---
export const validateParsifalCode = (editor: any, monaco: any) => {
  const model = editor.getModel();
  if (!model) return;
  const text = model.getValue();
  const markers: any[] = [ ];
  const containerSet = new Set(CONTAINERS);
  const stack: any[] = [ ];
  let i = 0;

  while (i < text.length) {
    if (text[i] === '[') {
      const startIdx = i; let depth = 0; let endIdx = -1;
      for (let j = i; j < text.length; j++) {
        if (text[j] === '[') depth++;
        else if (text[j] === ']') { depth--; if (depth === 0) { endIdx = j; break; } }
      }
      if (endIdx === -1) {
        const startPos = model.getPositionAt(startIdx);
        markers.push({ severity: monaco.MarkerSeverity.Error, message: "Missing closing bracket ']'", startLineNumber: startPos.lineNumber, startColumn: startPos.column, endLineNumber: startPos.lineNumber, endColumn: startPos.column + 1 });
        break; 
      }
      const headContent = text.substring(startIdx + 1, endIdx).trim();
      const isCloseTag = headContent.startsWith('/');
      const tagName = headContent.replace(/^\//, '').split(/\s+/)[0];

      if (containerSet.has(tagName)) {
        if (isCloseTag) {
          if (stack.length > 0) {
            const last = stack[stack.length - 1];
            if (last.tagName === tagName) stack.pop(); 
            else {
              const pos = model.getPositionAt(startIdx); const endPos = model.getPositionAt(endIdx + 1);
              markers.push({ severity: monaco.MarkerSeverity.Error, message: `Mismatched tag. Expected '[/${last.tagName}]', found '[/${tagName}]'.`, startLineNumber: pos.lineNumber, startColumn: pos.column, endLineNumber: endPos.lineNumber, endColumn: endPos.column });
            }
          } else {
            const pos = model.getPositionAt(startIdx); const endPos = model.getPositionAt(endIdx + 1);
            markers.push({ severity: monaco.MarkerSeverity.Error, message: `Stray closing tag '[/${tagName}]'.`, startLineNumber: pos.lineNumber, startColumn: pos.column, endLineNumber: endPos.lineNumber, endColumn: endPos.column });
          }
        } else stack.push({ tagName, startIdx, endIdx });
      } else if (isCloseTag) {
        const pos = model.getPositionAt(startIdx); const endPos = model.getPositionAt(endIdx + 1);
        markers.push({ severity: monaco.MarkerSeverity.Warning, message: `'${tagName}' is not a container tag and does not need closing.`, startLineNumber: pos.lineNumber, startColumn: pos.column, endLineNumber: endPos.lineNumber, endColumn: endPos.column });
      }
      i = endIdx + 1;
    } else if (text[i] === ']') {
      const pos = model.getPositionAt(i);
      markers.push({ severity: monaco.MarkerSeverity.Error, message: "Unexpected ']'", startLineNumber: pos.lineNumber, startColumn: pos.column, endLineNumber: pos.lineNumber, endColumn: pos.column + 1 });
      i++;
    } else i++;
  }
  for (const item of stack) {
    const pos = model.getPositionAt(item.startIdx); const endPos = model.getPositionAt(item.endIdx + 1);
    markers.push({ severity: monaco.MarkerSeverity.Error, message: `Missing '[/${item.tagName}]'`, startLineNumber: pos.lineNumber, startColumn: pos.column, endLineNumber: endPos.lineNumber, endColumn: endPos.column });
  }
  monaco.editor.setModelMarkers(model, 'parsifal', markers);
};