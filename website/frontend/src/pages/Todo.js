import { getAuth } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../firebase';

function Todo() {
  const [todos, setTodos] = useState([]);
  const [newTask, setNewTask] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all'); // all, pending, completed
  
  const auth = getAuth();
  const user = auth.currentUser;
  const phone = localStorage.getItem('userPhone') || '1234567890';

  useEffect(() => {
    fetchTodos();
  }, [user]);

  const fetchTodos = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      const userDoc = await getDoc(doc(db, 'users', phone));
      if (userDoc.exists()) {
        const data = userDoc.data();
        setTodos(data.todos || []);
      }
    } catch (err) {
      console.error('Error fetching todos:', err);
      setError('Failed to load todos.');
    } finally {
      setLoading(false);
    }
  };

  const addTodo = async (e) => {
    e.preventDefault();
    if (!newTask.trim()) return;
    
    try {
      const newTodoItem = {
        id: Date.now().toString(),
        task: newTask.trim(),
        done: false,
        createdAt: new Date().toISOString()
      };
      
      const updatedTodos = [...todos, newTodoItem];
      setTodos(updatedTodos);
      
      await updateDoc(doc(db, 'users', phone), {
        todos: updatedTodos,
        updatedAt: new Date().toISOString()
      });
      
      setNewTask('');
    } catch (err) {
      console.error('Error adding todo:', err);
      setError('Failed to add todo.');
      // Revert the optimistic update
      fetchTodos();
    }
  };

  const toggleTodo = async (todoId) => {
    try {
      const updatedTodos = todos.map(todo =>
        todo.id === todoId ? { ...todo, done: !todo.done } : todo
      );
      
      setTodos(updatedTodos);
      
      await updateDoc(doc(db, 'users', phone), {
        todos: updatedTodos,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('Error updating todo:', err);
      setError('Failed to update todo.');
      // Revert the optimistic update
      fetchTodos();
    }
  };

  const deleteTodo = async (todoId) => {
    if (!window.confirm('Are you sure you want to delete this task?')) return;
    
    try {
      const updatedTodos = todos.filter(todo => todo.id !== todoId);
      setTodos(updatedTodos);
      
      await updateDoc(doc(db, 'users', phone), {
        todos: updatedTodos,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('Error deleting todo:', err);
      setError('Failed to delete todo.');
      // Revert the optimistic update
      fetchTodos();
    }
  };

  const filteredTodos = todos.filter(todo => {
    if (filter === 'pending') return !todo.done;
    if (filter === 'completed') return todo.done;
    return true; // all
  });

  const getStats = () => {
    const total = todos.length;
    const completed = todos.filter(todo => todo.done).length;
    const pending = total - completed;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    return { total, completed, pending, completionRate };
  };

  if (loading) {
    return (
      <div className="todo-loading">
        <div className="loading-spinner"></div>
        <p>Loading your tasks...</p>
      </div>
    );
  }

  const stats = getStats();

  return (
    <div className="todo-page">
      <div className="todo-header">
        <h1>📝 Todo Manager</h1>
        <p>Manage your study tasks and stay organized.</p>
      </div>

      {error && (
        <div className="error-message">
          <p>⚠️ {error}</p>
          <button onClick={() => setError('')}>Dismiss</button>
        </div>
      )}

      {/* Stats */}
      <div className="todo-stats">
        <div className="stat-item">
          <span className="stat-number">{stats.total}</span>
          <span className="stat-label">Total</span>
        </div>
        <div className="stat-item">
          <span className="stat-number">{stats.pending}</span>
          <span className="stat-label">Pending</span>
        </div>
        <div className="stat-item">
          <span className="stat-number">{stats.completed}</span>
          <span className="stat-label">Completed</span>
        </div>
        <div className="stat-item">
          <span className="stat-number">{stats.completionRate}%</span>
          <span className="stat-label">Success Rate</span>
        </div>
      </div>

      {/* Add Todo Form */}
      <form onSubmit={addTodo} className="add-todo-form">
        <div className="form-group">
          <input
            type="text"
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            placeholder="Enter a new task..."
            className="todo-input"
            maxLength="200"
          />
          <button type="submit" className="add-btn" disabled={!newTask.trim()}>
            ➕ Add Task
          </button>
        </div>
      </form>

      {/* Filter Buttons */}
      <div className="filter-buttons">
        <button 
          className={filter === 'all' ? 'active' : ''}
          onClick={() => setFilter('all')}
        >
          All ({todos.length})
        </button>
        <button 
          className={filter === 'pending' ? 'active' : ''}
          onClick={() => setFilter('pending')}
        >
          Pending ({stats.pending})
        </button>
        <button 
          className={filter === 'completed' ? 'active' : ''}
          onClick={() => setFilter('completed')}
        >
          Completed ({stats.completed})
        </button>
      </div>

      {/* Todo List */}
      <div className="todo-list">
        {filteredTodos.length === 0 ? (
          <div className="empty-todos">
            {filter === 'all' && (
              <>
                <h3>🎯 Ready to get started?</h3>
                <p>Add your first task above or use the WhatsApp bot:</p>
                <code>todo add Study for math exam</code>
              </>
            )}
            {filter === 'pending' && (
              <>
                <h3>🎉 All caught up!</h3>
                <p>No pending tasks. Great job!</p>
              </>
            )}
            {filter === 'completed' && (
              <>
                <h3>📭 No completed tasks yet</h3>
                <p>Complete some tasks to see them here.</p>
              </>
            )}
          </div>
        ) : (
          filteredTodos.map((todo) => (
            <div 
              key={todo.id} 
              className={`todo-item ${todo.done ? 'completed' : 'pending'}`}
            >
              <div className="todo-content">
                <button
                  className="todo-toggle"
                  onClick={() => toggleTodo(todo.id)}
                  title={todo.done ? 'Mark as pending' : 'Mark as completed'}
                >
                  {todo.done ? '✅' : '⭕'}
                </button>
                
                <div className="todo-text">
                  <span className={todo.done ? 'strikethrough' : ''}>
                    {todo.task}
                  </span>
                  {todo.createdAt && (
                    <small className="todo-date">
                      Created: {new Date(todo.createdAt).toLocaleDateString()}
                    </small>
                  )}
                </div>
              </div>
              
              <button
                className="delete-btn"
                onClick={() => deleteTodo(todo.id)}
                title="Delete task"
              >
                🗑️
              </button>
            </div>
          ))
        )}
      </div>

      {/* WhatsApp Integration Info */}
      <div className="whatsapp-integration">
        <h3>📱 WhatsApp Commands</h3>
        <div className="command-list">
          <div className="command-item">
            <code>todo add [task]</code>
            <span>Add a new task</span>
          </div>
          <div className="command-item">
            <code>todo list</code>
            <span>View all tasks</span>
          </div>
          <div className="command-item">
            <code>done [number]</code>
            <span>Mark task as completed</span>
          </div>
          <div className="command-item">
            <code>help</code>
            <span>Show all available commands</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Todo;