import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  LinearProgress
} from '@mui/material';
import { Send, Upload, InsertDriveFile } from '@mui/icons-material';
import { styled } from '@mui/system';
import StreamingResponseHandler from './StreamingResponseHandler';

const API_URL = 'http://localhost:8000';

// ... (keep your styled components)

const StyledPaper = styled(Paper)({
    height: '70vh',
    overflow: 'auto',
    padding: '16px',
    marginBottom: '16px',
    backgroundColor: '#f5f5f5',
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

function ChatApp() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [file, setFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('llama3');
  const [documentContext, setDocumentContext] = useState('');
  const messagesEndRef = useRef(null);



  useEffect(() => {
    fetchModels();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  ///

  const fetchModels = async () => {
    try {
      const response = await axios.get(`${API_URL}/models`);
      
      const availableModels = response.data.models;
      // console.log('Available models:', availableModels.models);
      
      setModels(availableModels.models);
      console.log('Models:', availableModels.models, typeof availableModels.models);

    //   setModels(response.data.models);
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
  // ... (keep fetchModels, scrollToBottom, handleFileChange, handleUpload)

  const handleSendMessage = async () => {
    if (!input.trim()) return;

    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Add a placeholder for the assistant's response
    setMessages(prev => [...prev, { role: 'assistant', content: '', isStreaming: true }]);
  };

  const handleStreamComplete = (responseText) => {
    setMessages(prev => {
      const newMessages = [...prev];
      const lastMessage = newMessages[newMessages.length - 1];
      if (lastMessage.role === 'assistant' && lastMessage.isStreaming) {
        newMessages[newMessages.length - 1] = {
          ...lastMessage,
          content: responseText,
          isStreaming: false
        };
      }
      return newMessages;
    });
    setIsLoading(false);
  };

  const handleStreamError = (error) => {
    setMessages(prev => {
      const newMessages = [...prev];
      const lastMessage = newMessages[newMessages.length - 1];
      if (lastMessage.role === 'assistant' && lastMessage.isStreaming) {
        newMessages[newMessages.length - 1] = {
          ...lastMessage,
          content: `Error: ${error}`,
          isStreaming: false
        };
      }
      return newMessages;
    });
    setIsLoading(false);
  };

  // Update your message rendering to use the streaming component
  const renderMessageContent = (message) => {
    if (message.role === 'assistant' && message.isStreaming) {
      return (
        <StreamingResponseHandler
          question={messages[messages.length - 2]?.content || ''}
          context={documentContext}
          model={selectedModel}
          onComplete={handleStreamComplete}
          onError={handleStreamError}
        />
      );
    }
    return (
      <Typography component="div" whiteSpace="pre-wrap">
        {message.content}
      </Typography>
    );
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      {/* ... (keep your existing UI structure) */}
     {/*  */}
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
                 <MenuItem key={model} value={model}>
                   {model.model}
                 </MenuItem>
               ))}
             </Select>
           </FormControl>
     {/* */ }

      <StyledPaper elevation={3}>
        <List>
          {messages.map((message, index) => (
            <StyledMessage key={index} role={message.role}>
              <MessageBubble role={message.role}>
                {renderMessageContent(message)}
              </MessageBubble>
            </StyledMessage>
          ))}
          <div ref={messagesEndRef} />
        </List>
      </StyledPaper>

      {/* ... (keep the rest of your UI) */}

     
           <Box sx={{ display: 'flex', gap: 1 }}>
             <TextField
               fullWidth
               variant="outlined"
               value={input}
               onChange={(e) => setInput(e.target.value)}
               onKeyUp={(e) => e.key === 'Enter' && handleSendMessage()}
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

export default ChatApp;