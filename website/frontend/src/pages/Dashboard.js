import { getAuth } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../firebase';

function Dashboard() {
  const [userData, setUserData] = useState(null);
  const [schedule, setSchedule] = useState([]);
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const auth = getAuth();
  const user = auth.currentUser;

  useEffect(() => {
    const fetchUserData = async () => {
      if (!user) return;
      
      try {
        setLoading(true);
        
        // In a real app, you'd get the phone number from user profile
        // For demo purposes, we'll use a default or from localStorage
        const phone = localStorage.getItem('userPhone') || '1234567890';
        
        const userDoc = await getDoc(doc(db, 'users', phone));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setUserData(data);
          setSchedule(data.schedule || []);
          setTodos(data.todos || []);
        } else {
          setError('User profile not found. Please register your phone number.');
        }
      } catch (err) {
        console.error('Error fetching user data:', err);
        setError('Failed to load user data.');
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [user]);

  const getUpcomingClasses = () => {
    if (!schedule.length) return [];
    
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTimeInMinutes = currentHour * 60 + currentMinute;
    
    return schedule
      .filter(item => {
        // Convert class time to minutes for comparison
        const timeMatch = item.time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (!timeMatch) return false;
        
        let classHour = parseInt(timeMatch[1]);
        const classMinute = parseInt(timeMatch[2]);
        const ampm = timeMatch[3].toUpperCase();
        
        if (ampm === 'PM' && classHour !== 12) classHour += 12;
        if (ampm === 'AM' && classHour === 12) classHour = 0;
        
        const classTimeInMinutes = classHour * 60 + classMinute;
        return classTimeInMinutes > currentTimeInMinutes;
      })
      .slice(0, 3); // Get next 3 classes
  };

  const getPendingTodos = () => {
    return todos.filter(todo => !todo.done).slice(0, 5);
  };

  const getCompletionStats = () => {
    const totalTodos = todos.length;
    const completedTodos = todos.filter(todo => todo.done).length;
    const completionRate = totalTodos > 0 ? Math.round((completedTodos / totalTodos) * 100) : 0;
    
    return {
      total: totalTodos,
      completed: completedTodos,
      pending: totalTodos - completedTodos,
      completionRate
    };
  };

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner"></div>
        <p>Loading your dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-error">
        <h2>⚠️ Error</h2>
        <p>{error}</p>
        <div className="error-actions">
          <p>To get started:</p>
          <ol>
            <li>Open WhatsApp and message the Study Planner Bot</li>
            <li>Register your phone number using the web interface</li>
            <li>Upload your schedule via WhatsApp</li>
          </ol>
        </div>
      </div>
    );
  }

  const upcomingClasses = getUpcomingClasses();
  const pendingTodos = getPendingTodos();
  const stats = getCompletionStats();

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>📊 Dashboard</h1>
        <p>Welcome back! Here's your study overview.</p>
      </div>

      <div className="dashboard-grid">
        {/* Statistics Cards */}
        <div className="stats-container">
          <div className="stat-card">
            <h3>📅 Total Classes</h3>
            <div className="stat-number">{schedule.length}</div>
          </div>
          
          <div className="stat-card">
            <h3>📝 Total Tasks</h3>
            <div className="stat-number">{stats.total}</div>
          </div>
          
          <div className="stat-card">
            <h3>✅ Completed</h3>
            <div className="stat-number">{stats.completed}</div>
          </div>
          
          <div className="stat-card">
            <h3>📈 Completion Rate</h3>
            <div className="stat-number">{stats.completionRate}%</div>
          </div>
        </div>

        {/* Upcoming Classes */}
        <div className="dashboard-section">
          <h2>🕐 Upcoming Classes</h2>
          {upcomingClasses.length > 0 ? (
            <div className="classes-list">
              {upcomingClasses.map((classItem, index) => (
                <div key={index} className="class-item">
                  <div className="class-subject">{classItem.subject}</div>
                  <div className="class-time">{classItem.time}</div>
                  {classItem.day && <div className="class-day">{classItem.day}</div>}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <p>🎉 No upcoming classes today!</p>
              <p>Upload your schedule via WhatsApp to see classes here.</p>
            </div>
          )}
        </div>

        {/* Pending Todos */}
        <div className="dashboard-section">
          <h2>📋 Pending Tasks</h2>
          {pendingTodos.length > 0 ? (
            <div className="todos-list">
              {pendingTodos.map((todo, index) => (
                <div key={index} className="todo-item">
                  <div className="todo-task">{todo.task}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <p>🎯 All caught up!</p>
              <p>No pending tasks. Great job!</p>
            </div>
          )}
          {todos.length > 5 && (
            <a href="/todos" className="view-all-link">
              View all {todos.length} tasks →
            </a>
          )}
        </div>

        {/* Quick Actions */}
        <div className="dashboard-section">
          <h2>🚀 Quick Actions</h2>
          <div className="quick-actions">
            <div className="action-card">
              <h3>📱 WhatsApp Bot</h3>
              <p>Use these commands:</p>
              <ul>
                <li><code>todo add [task]</code> - Add new task</li>
                <li><code>todo list</code> - View all tasks</li>
                <li><code>done [number]</code> - Mark as complete</li>
                <li><code>help</code> - Show all commands</li>
              </ul>
            </div>
            
            <div className="action-card">
              <h3>📄 Upload Schedule</h3>
              <p>Send a PDF or image of your class schedule to the WhatsApp bot to automatically parse and set up reminders.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;