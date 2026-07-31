import * as AuthService from '../services/AuthService.js';

export const register = async (req, res, next) => {
  try {
    const { name, email, password, role, agencyId, examId } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        code: 'BAD_REQUEST',
        message: 'Name, email, and password are required fields.',
      });
    }

    // Self-registration can never assign privileged roles; normalize any stray role value.
    const normalizedRole = role === 'Super Admin' ? 'Super Admin' : 'User';
    const data = await AuthService.register(name, email, password, normalizedRole, agencyId, examId);

    // Send HTTP-only cookie for refresh token
    res.cookie('refreshToken', data.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.status(201).json({
      success: true,
      data: {
        user: data.user,
        token: data.token,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        code: 'BAD_REQUEST',
        message: 'Email and password are required fields.',
      });
    }

    const data = await AuthService.login(email, password);

    res.cookie('refreshToken', data.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      data: {
        user: data.user,
        token: data.token,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const logout = async (req, res) => {
  res.clearCookie('refreshToken');
  res.json({
    success: true,
    message: 'User logged out successfully.',
  });
};

export const getMe = async (req, res) => {
  const user = await req.user.populate(['primaryAgency', 'primaryExam', 'agencies', 'exams']);
  res.json({
    success: true,
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        primaryAgency: user.primaryAgency,
        primaryExam: user.primaryExam,
        agencies: user.agencies,
        exams: user.exams,
      },
    },
  });
};

export const updatePreferences = async (req, res, next) => {
  try {
    const { agencies, exams } = req.body;
    const user = req.user;
    if (Array.isArray(agencies)) user.agencies = agencies;
    if (Array.isArray(exams)) user.exams = exams;
    await user.save();
    res.json({ success: true, data: { user: { id: user._id, name: user.name, email: user.email, role: user.role, agencies: user.agencies, exams: user.exams } } });
  } catch (error) {
    next(error);
  }
};
