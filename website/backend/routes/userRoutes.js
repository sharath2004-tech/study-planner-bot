const express = require('express');
const router = express.Router();
const {
  registerUser,
  loginUser,
  getUserProfile,
  updateUserProfile,
  getUserSchedule,
  updateUserSchedule,
  getUserTodos,
  addTodo,
  updateTodo,
  deleteTodo,
  getAllUsers
} = require('./controllers/userController');

// User authentication routes
router.post('/register', registerUser);
router.post('/login', loginUser);

// GET endpoint for registration info (helpful for direct browser access)
router.get('/register', (req, res) => {
  res.json({
    message: 'Registration endpoint - use POST method',
    method: 'POST',
    url: '/api/users/register',
    requiredFields: ['email', 'phone'],
    example: {
      email: 'user@example.com',
      phone: '1234567890'
    },
    note: 'Use the registration form at http://localhost:5000/registration.html'
  });
});

// User profile routes
router.get('/profile/:phone', getUserProfile);
router.put('/profile/:phone', updateUserProfile);

// Schedule management routes
router.get('/:phone/schedule', getUserSchedule);
router.post('/:phone/schedule', updateUserSchedule);

// Todo management routes
router.get('/:phone/todos', getUserTodos);
router.post('/:phone/todos', addTodo);
router.put('/:phone/todos/:todoId', updateTodo);
router.delete('/:phone/todos/:todoId', deleteTodo);

// Get all registered users (for bot access)
router.get('/list', getAllUsers);

// Get all users (for development/testing)
router.get('/', async (req, res) => {
  try {
    const db = require('../../../config/firebase');
    const usersSnapshot = await db.collection('users').get();
    const users = [];
    
    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      users.push({
        phone: doc.id,
        email: userData.email,
        scheduleCount: userData.schedule ? userData.schedule.length : 0,
        todoCount: userData.todos ? userData.todos.length : 0,
        createdAt: userData.createdAt
      });
    });
    
    res.json({ users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      error: 'Failed to get users',
      message: error.message
    });
  }
});

module.exports = router;