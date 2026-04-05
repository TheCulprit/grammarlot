import axios from 'axios';

// If running in Vite dev mode (port 5173), point to the hardcoded Python dev server. 
// Otherwise (in the compiled .exe), use relative paths so it automatically matches whatever port is configured!
const API_BASE = window.location.port === '5173' ? 'http://127.0.0.1:8000/api' : '/api';

export const getAppConfig = async () => {
  const response = await axios.get(`${API_BASE}/config`);
  return response.data;
};

export const saveAppConfig = async (config: { root_dir: string; port: number }) => {
  const response = await axios.post(`${API_BASE}/config`, config);
  return response.data;
};

export const generateText = async (text: string, clean: boolean = true) => {
  const response = await axios.post(`${API_BASE}/generate`, { text, clean });
  return response.data;
};

export const fetchFiles = async () => {
  const response = await axios.get(`${API_BASE}/files`);
  return response.data;
};

export const getFileContent = async (path: string) => {
  const response = await axios.get(`${API_BASE}/files/${path}`);
  return response.data.content;
};

export const saveFileContent = async (path: string, content: string) => {
  const response = await axios.post(`${API_BASE}/files/${path}`, { content });
  return response.data;
};

export const deleteItem = async (path: string) => {
  const response = await axios.delete(`${API_BASE}/files/${path}`);
  return response.data;
};

export const createFolder = async (path: string) => {
  const response = await axios.post(`${API_BASE}/folders/${path}`);
  return response.data;
};

export const moveItem = async (oldPath: string, newPath: string) => {
  const response = await axios.post(`${API_BASE}/move`, { old_path: oldPath, new_path: newPath });
  return response.data;
};