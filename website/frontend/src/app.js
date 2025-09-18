import { onAuthStateChanged } from 'firebase/auth';
import React from 'react';
import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import './App.css';
import { auth } from './firebase';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Register from './pages/Register';
import Todo from './pages/Todo';

function App() {
  const [user, setUser] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading Study Planner Bot...</p>
      </div>
    );
  }

  return (
    <Router>
      <div className="App">
        <header className="App-header">
          <h1>📚 Study Planner Bot</h1>
          {user && (
            <nav className="nav-menu">
              <a href="/dashboard">Dashboard</a>
              <a href="/todos">Todos</a>
              <button 
                onClick={() => auth.signOut()} 
                className="logout-btn"
              >
                Logout
              </button>
            </nav>
          )}
        </header>

        <main className="App-main">
          <Routes>
            <Route 
              path="/login" 
              element={user ? <Navigate to="/dashboard" /> : <Login />} 
            />
            <Route 
              path="/register" 
              element={user ? <Navigate to="/dashboard" /> : <Register />} 
            />
            <Route 
              path="/dashboard" 
              element={user ? <Dashboard /> : <Navigate to="/login" />} 
            />
            <Route 
              path="/todos" 
              element={user ? <Todo /> : <Navigate to="/login" />} 
            />
            <Route 
              path="/" 
              element={user ? <Navigate to="/dashboard" /> : <Navigate to="/login" />} 
            />
          </Routes>
        </main>

        <footer className="App-footer">
          <p>&copy; 2025 Study Planner Bot. All rights reserved.</p>
        </footer>
      </div>
    </Router>
  );
}

export default App;