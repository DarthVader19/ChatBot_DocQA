import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import './chatbot.css';
import {Button} from '@mui/material';


const StreamChatApp = ({ apiUrl = "http://localhost:8000", defaultDarkMode = false }) => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [availableModels, setAvailableModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('gemma3');
  const [darkMode, setDarkMode] = useState(defaultDarkMode);
 const [isGeneralChat, setIsGeneralChat] = useState(false);
 const [isStreaming, setIsStreaming] = useState(false);
  
  const messagesEndRef = useRef(null);

  // Initialize with dark mode if preferred
  useEffect(() => {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    setDarkMode(defaultDarkMode || prefersDark);
  }, [defaultDarkMode]);

  useEffect(() => {
    console.log(selectedModel) // Log the selected model to the console
  }, [selectedModel]);
    
  // Fetch available models
  useEffect(() => {
    const fetchModels = async () => {
      try {
        console.log('Fetching models...');
        
        const response = await axios.get(`${apiUrl}/models`);
        if (response.data && response.data.models) {
            console.log('Available models:', response.data.models.models);
          setAvailableModels([{model:'No-Model'},...response.data.models.models]);
          if (response.data.models.models.length===1) {
            setSelectedModel(response.data.models.models[0].model);
          }
        }
      } catch (error) {
        console.error("Error fetching models:", error);
      }
    };
    
    fetchModels();
  }, [apiUrl]);

  // Auto-scroll to bottom
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    const newMessage = { role: 'user', content: inputMessage };
    setMessages([...messages, newMessage]);
    setInputMessage('');
    setIsLoading(true);

    let assistantMessage = { role: 'assistant', content: '' };
    setMessages((prevMessages) => [...prevMessages, assistantMessage]);

    try {
      const endpoint = isGeneralChat ? 'http://localhost:8000/general/chat' : 'http://localhost:8000/chat';

      console.log(endpoint);
      console.log(isGeneralChat);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, newMessage],
          model: selectedModel,
          streaming: isStreaming, // Pass the streaming flag to the backend
        }),
      });
         console.log(messages);

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


  const toggleChatMode = () => {
    setIsGeneralChat(!isGeneralChat);
    setMessages([]); // Clear messages when switching modes
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
          content: `Document uploaded successfully! I can now answer questions about this ${file.type} document.(${response.data.char_count} characters)` 
        };
        setMessages(prev => [...prev, successMessage]);
      }
    } catch (error) {
      console.error("Error uploading file:", error);
      const errorMessage = { 
        role: 'assistant', 
        content: "Failed to upload document. Please try again." 
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setUploadProgress(0);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const toggleChat = () => {
    setIsOpen(!isOpen);
    if (!isOpen && messages.length === 0) {
      const welcomeMessage = { 
        role: 'assistant', 
        content: "Hello! I'm your assistant Docy. Upload a PDF, DOCX, or TXT file to get started, or ask me a question about the portfolio." 
      };
      setMessages([welcomeMessage]);
    }
  };

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  

  return (
    <div className={`chatbot-container ${isOpen ? 'open' : ''} ${darkMode ? 'dark-mode' : ''}`}>
      <button className="chatbot-toggle" onClick={toggleChat}>
        {isOpen ? '×' : '💬'}
      </button>
      
      {isOpen && (
        <div className="chatbot-window">
          <div className="chatbot-header">
            <h3>Document Assistant</h3>
            <div className="header-controls">
              {/* <div className="chat-mode-toggle">
              <Button variant="contained" color="primary" onClick={toggleChatMode}>
                      Switch to {isGeneralChat ? 'Document Chat' : 'General Chat'}
                   </Button>
                   <div>
                   <Button
                          variant="contained"
                          color="info"
                          onClick={() => setIsStreaming(!isStreaming)}
                        >
                          {isStreaming ? 'Disable Streaming' : 'Enable Streaming'}
          </Button>
                    </div>
              </div> */}
                
              <div className="model-selector">
                <label htmlFor="model-select">Model:</label>
                <select 
                  id="model-select"
                  value={selectedModel}
                  onChange={(e) => {console.log(e.target.value);
                   setSelectedModel(e.target.value)}}
                   
                //   disabled={!isLoading}
                >
                  {availableModels.map(model => (
                    <option key={model.model} value={model.model}>{model.model}</option>
                  ))}
                </select>
              </div>
              <button 
                className="dark-mode-toggle"
                onClick={toggleDarkMode}
                aria-label="Toggle dark mode"
              >
                {darkMode ? '☀️' : '🌙'}
              </button>
             
            </div>
          </div>
          
          <div className="chatbot-messages">
            {messages.map((msg, index) => (
              <div 
                key={index} 
                className={`message ${msg.role}`}
              >
                <div className="message-content">
                  {msg.role === 'assistant' && (
                    <div className="bot-avatar">🤖</div>
                  )}
                  <div className="message-text">
                    {msg.content.split('\n').map((line, i) => (
                      <React.Fragment key={i}>
                        {line}
                        <br />
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="message assistant">
                <div className="message-content">
                  <div className="bot-avatar">🤖</div>
                  <div className="message-text">
                    <div className="typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          
          <div className="chatbot-input-area">
            {uploadProgress > 0 && uploadProgress < 100 && (
              <div className="upload-progress">
                <progress value={uploadProgress} max="100" />
                <span>{uploadProgress}%</span>
              </div>
            )}
            
            <div className="file-upload-container">
              <label htmlFor="file-upload" className="file-upload-button">
                📎 Upload
              </label>
              <input
                id="file-upload"
                type="file"
                accept=".pdf,.docx,.txt"
                onChange={handleFileUpload}
                disabled={isLoading}
              />
              {selectedFile && (
                <div className="file-info">
                  {selectedFile.name}
                </div>
              )}
            </div>
            
            <div className="text-input-container">
              <textarea
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyUp={handleKeyPress}
                placeholder="Type your message..."
                disabled={isLoading}
                rows={1}
              />
              <button 
                onClick={handleSendMessage} 
                disabled={isLoading || !inputMessage.trim()}
              >
                {isLoading ? '...' : '→'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StreamChatApp;