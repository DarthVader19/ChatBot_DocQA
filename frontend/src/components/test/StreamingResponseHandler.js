import { useState, useEffect } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import { DotLoader } from 'react-spinners';

const StreamingResponseHandler = ({ 
  question,
  context,
  model,
  onComplete,
  onError 
}) => {
  const [response, setResponse] = useState('');
  const [isStreaming, setIsStreaming] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    const fetchStream = async () => {
      try {
        const response = await fetch('http://localhost:8000/chat-stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: [
              {
                role: 'system',
                content: `Document Context:\n${context}\n\nAnswer the following question based on the document above.`
              },
              {
                role: 'user',
                content: question
              }
            ],
            model: model.model
          }),
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let responseText = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          responseText += chunk;
          
          if (isMounted) {
            setResponse(prev => prev + chunk);
          }
        }

        if (isMounted) {
          setIsStreaming(false);
          onComplete(responseText);
        }
      } catch (err) {
        if (err.name !== 'AbortError' && isMounted) {
          setError(err.message);
          onError(err.message);
          setIsStreaming(false);
        }
      }
    };

    fetchStream();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [question, context, model, onComplete, onError]);

  if (error) {
    return (
      <Typography color="error">
        Error: {error}
      </Typography>
    );
  }

  return (
    <Box>
      {response && (
        <Typography component="div" whiteSpace="pre-wrap">
          {response}
        </Typography>
      )}
      {isStreaming && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
          <DotLoader size={15} color="#1976d2" />
          <Typography variant="body2" color="text.secondary">
            Generating...
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default StreamingResponseHandler;