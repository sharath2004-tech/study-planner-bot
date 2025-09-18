const db = require('../../../../config/firebase');

// Register a new user
const registerUser = async (req, res) => {
  try {
    const { email, phone } = req.body;
    
    if (!email || !phone) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Email and phone are required'
      });
    }

    // Check if user already exists
    const userDoc = await db.collection('users').doc(phone).get();
    if (userDoc.exists) {
      return res.status(409).json({
        error: 'User already exists',
        message: 'A user with this phone number already exists'
      });
    }

    // Create new user document
    await db.collection('users').doc(phone).set({
      email,
      phone,
      schedule: [],
      todos: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        phone,
        email
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'Registration failed',
      message: error.message
    });
  }
};

// User login (just check if user exists)
const loginUser = async (req, res) => {
  try {
    const { phone } = req.body;
    
    if (!phone) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Phone number is required'
      });
    }

    // Check if user exists
    const userDoc = await db.collection('users').doc(phone).get();
    if (!userDoc.exists) {
      return res.status(404).json({
        error: 'User not found',
        message: 'No user found with this phone number'
      });
    }

    const userData = userDoc.data();
    res.json({
      message: 'Login successful',
      user: {
        phone: userData.phone,
        email: userData.email
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Login failed',
      message: error.message
    });
  }
};

// Get user profile
const getUserProfile = async (req, res) => {
  try {
    const { phone } = req.params;
    
    const userDoc = await db.collection('users').doc(phone).get();
    if (!userDoc.exists) {
      return res.status(404).json({
        error: 'User not found',
        message: 'No user found with this phone number'
      });
    }

    const userData = userDoc.data();
    res.json({
      user: {
        phone: userData.phone,
        email: userData.email,
        scheduleCount: userData.schedule ? userData.schedule.length : 0,
        todoCount: userData.todos ? userData.todos.length : 0,
        createdAt: userData.createdAt,
        updatedAt: userData.updatedAt
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      error: 'Failed to get profile',
      message: error.message
    });
  }
};

// Update user profile
const updateUserProfile = async (req, res) => {
  try {
    const { phone } = req.params;
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Email is required'
      });
    }

    // Check if user exists
    const userDoc = await db.collection('users').doc(phone).get();
    if (!userDoc.exists) {
      return res.status(404).json({
        error: 'User not found',
        message: 'No user found with this phone number'
      });
    }

    // Update user
    await db.collection('users').doc(phone).update({
      email,
      updatedAt: new Date().toISOString()
    });

    res.json({
      message: 'Profile updated successfully',
      user: { phone, email }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      error: 'Failed to update profile',
      message: error.message
    });
  }
};

// Get user schedule
const getUserSchedule = async (req, res) => {
  try {
    const { phone } = req.params;
    
    const userDoc = await db.collection('users').doc(phone).get();
    if (!userDoc.exists) {
      return res.status(404).json({
        error: 'User not found',
        message: 'No user found with this phone number'
      });
    }

    const userData = userDoc.data();
    res.json({
      schedule: userData.schedule || []
    });
  } catch (error) {
    console.error('Get schedule error:', error);
    res.status(500).json({
      error: 'Failed to get schedule',
      message: error.message
    });
  }
};

// Update user schedule
const updateUserSchedule = async (req, res) => {
  try {
    const { phone } = req.params;
    const { schedule } = req.body;
    
    if (!schedule || !Array.isArray(schedule)) {
      return res.status(400).json({
        error: 'Invalid schedule data',
        message: 'Schedule must be an array'
      });
    }

    // Check if user exists
    const userDoc = await db.collection('users').doc(phone).get();
    if (!userDoc.exists) {
      return res.status(404).json({
        error: 'User not found',
        message: 'No user found with this phone number'
      });
    }

    // Update schedule
    await db.collection('users').doc(phone).update({
      schedule,
      updatedAt: new Date().toISOString()
    });

    res.json({
      message: 'Schedule updated successfully',
      schedule
    });
  } catch (error) {
    console.error('Update schedule error:', error);
    res.status(500).json({
      error: 'Failed to update schedule',
      message: error.message
    });
  }
};

// Get user todos
const getUserTodos = async (req, res) => {
  try {
    const { phone } = req.params;
    
    const userDoc = await db.collection('users').doc(phone).get();
    if (!userDoc.exists) {
      return res.status(404).json({
        error: 'User not found',
        message: 'No user found with this phone number'
      });
    }

    const userData = userDoc.data();
    res.json({
      todos: userData.todos || []
    });
  } catch (error) {
    console.error('Get todos error:', error);
    res.status(500).json({
      error: 'Failed to get todos',
      message: error.message
    });
  }
};

// Add new todo
const addTodo = async (req, res) => {
  try {
    const { phone } = req.params;
    const { task } = req.body;
    
    if (!task) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Task is required'
      });
    }

    // Check if user exists
    const userDoc = await db.collection('users').doc(phone).get();
    if (!userDoc.exists) {
      return res.status(404).json({
        error: 'User not found',
        message: 'No user found with this phone number'
      });
    }

    const userData = userDoc.data();
    const todos = userData.todos || [];
    
    const newTodo = {
      id: Date.now().toString(),
      task,
      done: false,
      createdAt: new Date().toISOString()
    };
    
    todos.push(newTodo);

    // Update todos
    await db.collection('users').doc(phone).update({
      todos,
      updatedAt: new Date().toISOString()
    });

    res.status(201).json({
      message: 'Todo added successfully',
      todo: newTodo
    });
  } catch (error) {
    console.error('Add todo error:', error);
    res.status(500).json({
      error: 'Failed to add todo',
      message: error.message
    });
  }
};

// Update todo
const updateTodo = async (req, res) => {
  try {
    const { phone, todoId } = req.params;
    const { task, done } = req.body;
    
    // Check if user exists
    const userDoc = await db.collection('users').doc(phone).get();
    if (!userDoc.exists) {
      return res.status(404).json({
        error: 'User not found',
        message: 'No user found with this phone number'
      });
    }

    const userData = userDoc.data();
    const todos = userData.todos || [];
    
    const todoIndex = todos.findIndex(todo => todo.id === todoId);
    if (todoIndex === -1) {
      return res.status(404).json({
        error: 'Todo not found',
        message: 'No todo found with this ID'
      });
    }

    // Update todo
    if (task !== undefined) todos[todoIndex].task = task;
    if (done !== undefined) todos[todoIndex].done = done;
    todos[todoIndex].updatedAt = new Date().toISOString();

    // Save updated todos
    await db.collection('users').doc(phone).update({
      todos,
      updatedAt: new Date().toISOString()
    });

    res.json({
      message: 'Todo updated successfully',
      todo: todos[todoIndex]
    });
  } catch (error) {
    console.error('Update todo error:', error);
    res.status(500).json({
      error: 'Failed to update todo',
      message: error.message
    });
  }
};

// Delete todo
const deleteTodo = async (req, res) => {
  try {
    const { phone, todoId } = req.params;
    
    // Check if user exists
    const userDoc = await db.collection('users').doc(phone).get();
    if (!userDoc.exists) {
      return res.status(404).json({
        error: 'User not found',
        message: 'No user found with this phone number'
      });
    }

    const userData = userDoc.data();
    const todos = userData.todos || [];
    
    const todoIndex = todos.findIndex(todo => todo.id === todoId);
    if (todoIndex === -1) {
      return res.status(404).json({
        error: 'Todo not found',
        message: 'No todo found with this ID'
      });
    }

    // Remove todo
    todos.splice(todoIndex, 1);

    // Save updated todos
    await db.collection('users').doc(phone).update({
      todos,
      updatedAt: new Date().toISOString()
    });

    res.json({
      message: 'Todo deleted successfully'
    });
  } catch (error) {
    console.error('Delete todo error:', error);
    res.status(500).json({
      error: 'Failed to delete todo',
      message: error.message
    });
  }
};

// Get all registered users (for bot access)
const getAllUsers = async (req, res) => {
  try {
    const usersSnapshot = await db.collection('users').get();
    const users = [];
    
    usersSnapshot.forEach(doc => {
      users.push({
        phone: doc.id,
        email: doc.data().email
      });
    });
    
    res.json(users);
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({
      error: 'Failed to get users',
      message: error.message
    });
  }
};

module.exports = {
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
};