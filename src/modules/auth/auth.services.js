const bcrypt = require('bcryptjs');
const User = require('../../models/user');
const { generateToken } = require('../../utils/auth.utils');
const AppError = require('../../utils/AppError');

const register = async (data) => {
  const { name, email, password } = data;

  try {
    const hashedPassword = await bcrypt.hash(password, 12);
    const newUser = await User.create({
      name,
      email,
      password: hashedPassword,
    });

    return {
      id: newUser._id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
    };
  } catch (err) {
    if (err.code === 11000) throw new AppError('Email already exists', 409);
    throw err;
  }
};

const login = async (email, password) => {
  const existingUser = await User.findOne({ email }).select('+password');

  if (!existingUser) {
    throw new AppError('Invalid Email or Password', 401);
  }

  const isMatch = await bcrypt.compare(password, existingUser.password);

  if (!isMatch) {
    throw new AppError('Invalid Email or Password', 401);
  }

  const token = generateToken({
    id: existingUser._id,
    role: existingUser.role,
  });

  return {
    token,
    user: {
      id: existingUser._id,
      name: existingUser.name,
      email: existingUser.email,
      role: existingUser.role,
    },
  };
};

const getUserById = async (id) => {
  const user = await User.findById(id).select('-password');
  if (!user) throw new AppError('User not found', 404);

  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
};

module.exports = {
  register,
  login,
  getUserById,
};