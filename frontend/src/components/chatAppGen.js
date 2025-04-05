import React, { useState, useRef, useEffect, use } from 'react';
import axios from 'axios';
import {
  Box,
  Button,
  Container,
  TextField,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemText,
  CircularProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  LinearProgress,
  Switch,
  Avatar,
  Tooltip
} from '@mui/material';
import { Send, Upload, Close, ChatBubbleOutline, FiberManualRecord, Brightness4, Brightness7 } from '@mui/icons-material';

const ChatAppGen = ({ apiUrl = "http://localhost:8000", defaultDarkMode = false }) => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [availableModels, setAvailableModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [darkMode, setDarkMode] = useState(defaultDarkMode);
  const [isGeneralChat, setIsGeneralChat] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  const messagesEndRef = useRef(null);

  // Initialize dark mode
  useEffect(() => {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    setDarkMode(defaultDarkMode || prefersDark);
  }, [defaultDarkMode]);


  

  // Fetch available models
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const response = await axios.get(`${apiUrl}/models`);
        if (response.data && response.data.models) {
          setAvailableModels([ ...response.data.models.models,{ model: 'No-Model' }]);
          if (response.data.models.models.length === 1) {
            setSelectedModel(response.data.models.models[0].model);
          }
          return response.data.models.models;
        }
      } catch (error) {
        console.error("Error fetching models:", error);
      }
    };

    const models = fetchModels();
    // console.log("models fetched", availableModels);
    // console.log(models);
    
    
  }, [apiUrl]);


  // Set default model if only one is availableuseEffect(() => {
    useEffect(() => {
      if (availableModels.length > 0 && !selectedModel) {
        setSelectedModel(availableModels[0].model); // Automatically select the first model
      }
      // console.log("availableModels", availableModels);
      // console.log("selectedModel", selectedModel);
      
    }, [availableModels, selectedModel]);

  // Auto-scroll to the bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;
    if (selectedModel === 'No-Model' || selectedModel === '') {
      alert("Please select a model to continue.");
    }
    const newMessage = { role: 'user', content: inputMessage };
    setMessages([...messages, newMessage]);
    setInputMessage('');
    setIsLoading(true);

    let assistantMessage = { role: 'assistant', content: '' };
    setMessages((prevMessages) => [...prevMessages, assistantMessage]);

    try {
      const endpoint = isGeneralChat ? `${apiUrl}/general/chat` : `${apiUrl}/chat`;
      // console.log("endpoint", endpoint);
      

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, newMessage],
          model: selectedModel,
          streaming: isStreaming,
        }),
      });

      if (isStreaming) {
        // Handle streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        const processStream = async () => {
          let fullContent = '';

          while (true) {
            const { value, done } = await reader.read();
            if (done) {
              setIsLoading(false);
              break;
            }

            const chunk = decoder.decode(value);
            try {
              const parsedChunk = JSON.parse(chunk);

              if (parsedChunk && parsedChunk.response) {
                fullContent += parsedChunk.response;
                setMessages((prevMessages) => {
                  const updatedMessages = [...prevMessages];
                  updatedMessages[updatedMessages.length - 1].content = fullContent;
                  return updatedMessages;
                });
              }
            } catch (error) {
              console.error('Error parsing chunk:', error);
            }
          }
        };

        await processStream();
      } else {
        // Handle non-streaming response
        const jsonResponse = await response.json();
        setMessages((prevMessages) => {
          const updatedMessages = [...prevMessages];
          updatedMessages[updatedMessages.length - 1].content = jsonResponse.response;
          return updatedMessages;
        });
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages([
        ...messages,
        newMessage,
        { role: 'assistant', content: 'Failed to get response.' },
      ]);
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setSelectedFile(file);
    const formData = new FormData();
    formData.append('file', file);

    try {
      setIsLoading(true);
      const response = await axios.post(`${apiUrl}/upload`, formData, {
        onUploadProgress: (progressEvent) => {
          const progress = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setUploadProgress(progress);
        },
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.data) {
        const successMessage = {
          role: 'assistant',
          content: `Document uploaded successfully! I can now answer questions about this ${file.type} document. (${response.data.char_count} characters)`,
        };
        setMessages((prev) => [...prev, successMessage]);
      }
    } catch (error) {
      console.error("Error uploading file:", error);
      const errorMessage = {
        role: 'assistant',
        content: "Failed to upload document. Please try again.",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setUploadProgress(0);
    }
  };

  const toggleChat = () => {
    setIsOpen(!isOpen);
    if (!isOpen && messages.length === 0) {
      const welcomeMessage = {
        role: 'assistant',
        content: "Hello! I'm your assistant Docy. Upload a PDF, DOCX, or TXT file to get started, or ask me a question about the portfolio.",
      };
      setMessages([welcomeMessage]);
    }
  };

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  return (
    <Container
      maxWidth="sm"
      sx={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        width: { xs: '95%', sm: '400px' }, // Adjust width for small and larger screens
      }}
    >
      <Button
        variant="contained"
        color="primary"
        onClick={toggleChat}
        startIcon={isOpen ? <Close sx={{
          padding: 10,
        }} /> : <ChatBubbleOutline />}
        sx={{
          borderRadius: '50%',
          width: { xs: 50, sm: 60 }, // Adjust button size for small and larger screens
          height: { xs: 50, sm: 60 },
          alignItems: 'center',
          justifyContent: 'center',
          
        }}
      >
      </Button>

      {isOpen && (
        <Paper
          elevation={3}
          sx={{
            p: 2,
            mt: 2,
            borderRadius: 2,
            backgroundColor: darkMode ? '#333' : '#fff',
            color: darkMode ? '#fff' : '#000',
            width: '100%', // Ensure the Paper takes full width of the container
            maxHeight: { xs: '70vh', sm: '80vh' }, // Adjust height for small and larger screens
            overflowY: 'auto', // Enable scrolling for long content
          }}
        >
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              mb: 2,
            }}
          >
            <Typography variant="h6" sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
              Doc-QA
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 2 } }}>

      
    
              <FormControl sx={{ m:1, minWidth: { xs: 80, sm: 120 } }}>
                {/* <InputLabel sx={{ fontSize: { xs: '0.75rem', sm: '1rem' }, color: darkMode ? '#fff' : '#000' }}>
                  Model
                </InputLabel> */}
                <InputLabel id="demo-simple-select-helper-label">Model</InputLabel>
                <Select
                  value={selectedModel}
                   labelId="demo-simple-select-helper-label"
                   id="demo-simple-select-helper"
                   label="Model"
                  onChange={(e) => {
                   setSelectedModel(e.target.value)
                  }}
                  
                //  
                >
                  {availableModels.map((model) => (
                    <MenuItem
                      key={model.model}
                      value={model.model}
                      sx={{
                        fontSize: { xs: '0.75rem', sm: '1rem' },
                        color: darkMode ? '#fff' : '#1b1b1b',
                        backgroundColor: darkMode ? '#444' : '#f9f9f9',
                      }}
                    >
                      {model.model}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Tooltip title="Streaming output">
              <Button
                variant="contained"
                size="small"
                sx={{
                  backgroundColor: isStreaming ? 'green' : 'gray',
                  color: 'white',
                  minWidth: { xs: 25, sm: 40 },
                  height: { xs: 25, sm: 40 },
                  borderRadius: '50%',

                   }}
                onClick={() => setIsStreaming(!isStreaming)}
              >
                <FiberManualRecord fontSize="small" />
              </Button>
              </Tooltip>
             
            
              <IconButton
                onClick={toggleDarkMode}
                color="inherit"
                sx={{
                  width: { xs: 30, sm: 40 },
                  height: { xs: 30, sm: 40 },
                  padding: 0,
                }}
              >
                {darkMode ? <Brightness7 sx={{
        
                }} /> : <Brightness4 />}
              </IconButton>
            </Box>
          </Box>

          <Box
            sx={{
              height: { xs: 300, sm: 350 },
              overflowY: 'auto',
              mb: 2,
              backgroundColor: darkMode ? '#444' : '#f9f9f9',
              color: darkMode ? '#fff' : '#000',
              borderRadius: 1,
              padding: 1,
            }}
          >
            <List>
              {messages.map((msg, index) => (
                <ListItem
                  key={index}
                  sx={{
                    display: 'flex',
                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    ml: msg.role === 'user' ? 0.2 : 0,
                    padding: 0,
                    mb: 1,
                  }}
                >
                  {msg.role === 'assistant' && (
                    <Avatar
                      sx={{
                        bgcolor: darkMode ? '#444' : '#e0f7fa',
                        color: darkMode ? '#fff' : '#000',
                        mr: 0,
                        width: { xs: 30, sm: 40 },
                        height: { xs: 30, sm: 40 },
                      }}
                    >
                      🤖
                    </Avatar>
                  )}
                  <Box
                    sx={{
                      maxWidth: { xs: '90%', sm: '80%' },
                      p: { xs: 1, sm: 1.5 },
                      borderRadius: 2,
                      backgroundColor: msg.role === 'user' ? (darkMode ? '#8fbdeb' : '#e0f7fa') : (darkMode ? '#87807f' : '#f1f8e9'),
                      color: darkMode ? '#fff' : '#000',
                      textAlign: msg.role === 'user' ? 'right' : 'left',
                      whiteSpace: 'pre-wrap', // Preserve formatting from the API
                      fontSize: { xs: '0.7rem', sm: '0.9rem' },
                    }}
                  >
                    {msg.content}
                  </Box>
                  {msg.role === 'user' && (
                    <Avatar
                      sx={{
                        bgcolor: darkMode ? '#444' : '#e0f7fa',
                        color: darkMode ? '#000' : '#000',
                        ml: 1,
                        width: { xs: 30, sm: 40 },
                        height: { xs: 30, sm: 40 },
                      }}
                    >
                      🙋
                    </Avatar>
                  )}
                </ListItem>
              ))}
              {isLoading && (
                <ListItem>
                  <CircularProgress size={20} />
                </ListItem>
              )}
              <div ref={messagesEndRef} />
            </List>
          </Box>

          {uploadProgress > 0 && (
            <Box sx={{ mb: 2 }}>
              <LinearProgress variant="determinate" value={uploadProgress} />
              <Typography variant="caption" display="block" textAlign="center">
                Uploading: {uploadProgress}%
              </Typography>
            </Box>
          )}

          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              fullWidth
              variant="outlined"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Type your message..."
              disabled={isLoading}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && inputMessage.trim()) {
                  e.preventDefault(); // Prevents the default behavior of Enter key
                  handleSendMessage();
                }
              }}
              InputProps={{
                style: {
                  color: darkMode ? 'white' : 'blue', // Change text color based on dark mode
                },
              }}
              sx={{
                fontSize: { xs: '0.8rem', sm: '1rem' },
                color: darkMode ? 'white' : 'blue',
                
              }}
            />
            <IconButton
              color="primary"
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || isLoading}
              sx={{
                width: { xs: 40, sm: 50 },
                height: { xs: 40, sm: 50 },
              }}
            >
              <Send />
            </IconButton>
          </Box>

          {!isGeneralChat && (
            <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
              <Button
                variant="contained"
                component="label"
                fullWidth
                sx={{
                  fontSize: { xs: '0.8rem', sm: '1rem' },
                }}
              >
                Upload Document
                <input
                  type="file"
                  hidden
                  accept=".pdf,.docx,.txt"
                  onChange={(e) => {setSelectedFile(e.target.files[0]); handleFileUpload(e);}}
                />
              </Button>
             
            </Box>
          )}
          <Box  sx={{ mt: 2, display: 'flex', gap: 1 }}>
          <Button
                variant="contained"
                color={isGeneralChat ? 'success' : 'primary'}
                fullWidth
                onClick={() => setIsGeneralChat(!isGeneralChat)}
                sx={{
                  fontSize: { xs: '0.8rem', sm: '1rem' },
                }}
              >
                {isGeneralChat ? 'General Chat On' : 'chat without Document'}
              </Button>
          </Box>
          
        </Paper>
      )}
    </Container>
  );
};

export default ChatAppGen;