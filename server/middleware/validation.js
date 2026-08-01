const Joi = require('joi');

/**
 * Express middleware to validate request body against a Joi schema
 */
const validateBody = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, { abortEarly: false });
    if (error) {
      const errorMessages = error.details.map(detail => detail.message);
      return res.status(400).json({ errors: errorMessages });
    }
    next();
  };
};

// Account registration validation schema
const registerSchema = Joi.object({
  name: Joi.string().min(2).max(50).required().messages({
    'string.min': 'Name must be at least 2 characters long',
    'string.max': 'Name cannot exceed 50 characters',
    'any.required': 'Name is required'
  }),
  email: Joi.string().email().required().messages({
    'string.email': 'Please enter a valid email address',
    'any.required': 'Email is required'
  }),
  password: Joi.string().min(6).required().messages({
    'string.min': 'Password must be at least 6 characters long',
    'any.required': 'Password is required'
  })
});

// Login validation schema
const loginSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Please enter a valid email address',
    'any.required': 'Email is required'
  }),
  password: Joi.string().required().messages({
    'any.required': 'Password is required'
  })
});

// Assessment submission validation schema
const assessmentSubmissionSchema = Joi.object({
  answers: Joi.array().items(
    Joi.object({
      questionId: Joi.string().hex().length(24).required().messages({
        'string.length': 'Invalid question ID format',
        'string.hex': 'Invalid question ID format',
        'any.required': 'Question ID is required'
      }),
      selectedAnswer: Joi.string().required().messages({
        'any.required': 'Selected answer is required'
      })
    })
  ).min(1).required().messages({
    'array.min': 'You must submit at least one answer',
    'any.required': 'Answers list is required'
  })
});

module.exports = {
  validateBody,
  registerSchema,
  loginSchema,
  assessmentSubmissionSchema
};
