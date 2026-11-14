import React from 'react';
import { createRoot } from 'react-dom/client';
import PlayerView from './PlayerView.jsx';
import HostView from './HostView.jsx';
import './styles.css';

// One page, two roles: the host laptop opens /?host, everyone else scans the QR.
const isHost = new URLSearchParams(location.search).has('host');
createRoot(document.getElementById('root')).render(isHost ? <HostView /> : <PlayerView />);
