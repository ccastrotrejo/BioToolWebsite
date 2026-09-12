import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import { App } from './App';
import '../tokens.css';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('BioTool could not find its application root.');
ReactDOM.createRoot(root).render(<React.StrictMode><App /></React.StrictMode>);
