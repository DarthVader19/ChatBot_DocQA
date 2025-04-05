// import logo from './logo.svg';
// import './App.css';

// function App() {
//   return (
//     <div className="App">
//       <header className="App-header">
//         <img src={logo} className="App-logo" alt="logo" />
//         <p>
//           Edit <code>src/App.js</code> and save to reload.
//         </p>
//         <a
//           className="App-link"
//           href="https://reactjs.org"
//           target="_blank"
//           rel="noopener noreferrer"
//         >
//           Learn React
//         </a>
//       </header>
//     </div>
//   );
// }

// export default App;


import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import { 
  Container, 
  TextField, 
  Button, 
  Box, 
  Typography, 
  Paper, 
  List, 
  ListItem, 
  ListItemText, 
  ListItemAvatar, 
  Avatar, 
  IconButton,
  CircularProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  LinearProgress
} from '@mui/material';
import { Send, Upload, InsertDriveFile } from '@mui/icons-material';
import { styled } from '@mui/system';

const API_URL = 'http://localhost:8000';

const StyledPaper = styled(Paper)({
  height: '70vh',
  overflow: 'auto',
  padding: '16px',
  marginBottom: '16px',
  backgroundColor: '#666161',
});

const StyledMessage = styled(Box)(({ role }) => ({
  display: 'flex',
  justifyContent: role === 'user' ? 'flex-end' : 'flex-start',
  marginBottom: '8px',
}));

const MessageBubble = styled(Box)(({ role }) => ({
  maxWidth: '70%',
  padding: '8px 16px',
  borderRadius: role === 'user' 
    ? '18px 18px 0 18px' 
    : '18px 18px 18px 0',
  backgroundColor: role === 'user' ? '#1976d2' : '#e0e0e0',
  color: role === 'user' ? 'white' : 'black',
}));

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [file, setFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState({'model': 'gemma3'});
  const messagesEndRef = useRef(null);

  useEffect(() => {
    fetchModels();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchModels = async () => {
    try {
      const response = await axios.get(`${API_URL}/models`);
      const availableModels = response.data.models.models;
      // console.log('Available models:', availableModels.models);
      
      setModels(availableModels);
      console.log('Models:', availableModels, typeof availableModels);
      
    } catch (error) {
      console.error('Error fetching models:', error);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleUpload = async () => {
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      setIsLoading(true);
      setUploadProgress(0);
      
      const response = await axios.post(`${API_URL}/upload`, formData, {
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setUploadProgress(percentCompleted);
        },
      });

      setMessages([{
        role: 'system',
        content: `Document uploaded successfully (${response.data.char_count} characters)`
      }]);
    } catch (error) {
      console.error('Upload error:', error);
    } finally {
      setIsLoading(false);
      setUploadProgress(0);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim()) return;
     
    console.log(selectedModel);
    
    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    console.log('Selected model:', selectedModel.model, typeof
      selectedModel.model, 'Input:', input, 'Messages:', messages, 'File:', file, 'Upload Progress:', uploadProgress
    );
    
    try {
      const requestBody = {
        messages: [
          {
            role: "user",
            content: String(input)
          }
        ],
        model: selectedModel,
      };

      // await fetch(`${API_URL}/chat`, {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //   },
      //   body: JSON.stringify(requestBody),
      // }).then((response) => {
      //   if (!response.ok) {
      //     throw new Error(`HTTP error! status: ${response.status}`);
      //   }
      //   return response.json();
      // }
      // ).then((data) => {
      //   console.log('Response:', data);
      //   setMessages(prev => [...prev, { 
      //     role: 'assistant', 
      //     content: data.response 
      //   }]);
      // }
      // ).catch((error) => {
      //   console.error('Error:', error);
      //   setMessages(prev => [...prev, { 
      //     role: 'assistant', 
      //     content: 'Sorry, I encountered an error processing your request.'
      //   }]);
      // }
      // );
      // Using axios for the same request
      const response = await axios.post(`${API_URL}/chat`,JSON.stringify(requestBody), {
        headers: {
          'Content-Type': 'application/json',
        },
      });
      // console.log('Response:', response);
      console.log('Response:', response.data);
      

      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: response.data.response 
      }]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Sorry, I encountered an error processing your request.'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom align="center">
        Document Chatbot
      </Typography>

      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
        <Box sx={{ flexGrow: 1 }}>
          <input
            accept=".pdf,.docx,.txt"
            style={{ display: 'none' }}
            id="document-upload"
            type="file"
            onChange={handleFileChange}
          />
          <label htmlFor="document-upload">
            <Button
              variant="contained"
              component="span"
              startIcon={<Upload />}
              fullWidth
            >
              {file ? file.name : 'Select Document'}
            </Button>
          </label>
        </Box>
        <Button
          variant="contained"
          color="primary"
          onClick={handleUpload}
          disabled={!file || isLoading}
          startIcon={<InsertDriveFile />}
        >
          Upload
        </Button>
      </Box>

      {uploadProgress > 0 && (
        <Box sx={{ width: '100%', mb: 2 }}>
          <LinearProgress variant="determinate" value={uploadProgress} />
          <Typography variant="caption" display="block" textAlign="center">
            Uploading: {uploadProgress}%
          </Typography>
        </Box>
      )}

      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel>Model</InputLabel>
        <Select
          value={selectedModel}
          label="Model"
          onChange={(e) => setSelectedModel(e.target.value)}
        >
          {models.map((model) => ( 
          
            <MenuItem key={model.model} value={model.model}>
              {model.model}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <StyledPaper elevation={3}>
        <List>
          {messages.map((message, index) => (
            <StyledMessage key={index} role={message.role}>
              <MessageBubble role={message.role}>
                {message.role === 'assistant' ? (
                  <ReactMarkdown>{message.content}</ReactMarkdown>
                ) : (
                  <Typography>{message.content}</Typography>
                )}
              </MessageBubble>
            </StyledMessage>
          ))}
          {isLoading && (
            <StyledMessage role="assistant">
              <MessageBubble role="assistant">
                <CircularProgress size={20} />
              </MessageBubble>
            </StyledMessage>
          )}
          <div ref={messagesEndRef} />
        </List>
      </StyledPaper>

      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          fullWidth
          variant="outlined"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
          placeholder="Ask a question about the document..."
          disabled={isLoading}
        />
        <Button
          variant="contained"
          color="primary"
          onClick={handleSendMessage}
          disabled={!input.trim() || isLoading}
        >
          <Send />
        </Button>
      </Box>
    </Container>
  );
}

export default App;
