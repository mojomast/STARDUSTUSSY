import React, { useId as useReactId } from 'react';

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'aria-invalid'> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  onRightIconClick?: () => void;
  fullWidth?: boolean;
  required?: boolean;
}

export function Input({
  label,
  error,
  helperText,
  leftIcon,
  rightIcon,
  onRightIconClick,
  fullWidth = false,
  required = false,
  id,
  className = '',
  ...props
}: InputProps): React.ReactElement {
  const generatedId = useReactId();
  const inputId = id || generatedId;
  const errorId = `${inputId}-error`;
  const helperId = `${inputId}-helper`;

  const hasError = !!error;

  const baseClasses = 'block rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500';
  const errorClasses = hasError ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : '';
  const widthClass = fullWidth ? 'w-full' : '';

  return (
    <div className={`relative ${fullWidth ? 'w-full' : ''}`}>
      {label && (
        <label
          htmlFor={inputId}
          className={`block text-sm font-medium mb-1 ${hasError ? 'text-red-700' : 'text-gray-700'}`}
        >
          {label}
          {required && <span className="text-red-500 ml-1" aria-label="required">*</span>}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none" aria-hidden="true">
            <span className="text-gray-400">{leftIcon}</span>
          </div>
        )}
        <input
          id={inputId}
          className={`block px-3 py-2 ${baseClasses} ${errorClasses} ${widthClass} ${leftIcon ? 'pl-10' : ''} ${rightIcon ? 'pr-10' : ''} ${className}`.trim()}
          aria-invalid={hasError}
          aria-describedby={hasError ? errorId : helperText ? helperId : undefined}
          {...props}
        />
        {rightIcon && (
          <button
            type="button"
            onClick={onRightIconClick}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none focus:text-gray-600"
            aria-label={props.type === 'password' ? 'Toggle password visibility' : 'Clear input'}
          >
            <span aria-hidden="true">{rightIcon}</span>
          </button>
        )}
      </div>
      {hasError && (
        <p id={errorId} className="mt-1 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      {helperText && !hasError && (
        <p id={helperId} className="mt-1 text-sm text-gray-500">
          {helperText}
        </p>
      )}
    </div>
  );
}

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  description?: string;
  error?: string;
}

export function Checkbox({
  label,
  description,
  error,
  id,
  className = '',
  ...props
}: CheckboxProps): React.ReactElement {
  const generatedId = useReactId();
  const checkboxId = id || generatedId;
  const errorId = `${checkboxId}-error`;

  return (
    <div className="flex items-start">
      <div className="flex items-center h-5">
        <input
          id={checkboxId}
          type="checkbox"
          className={`h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 ${error ? 'border-red-300 focus:ring-red-500' : ''} ${className}`.trim()}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : description ? `${checkboxId}-desc` : undefined}
          {...props}
        />
      </div>
      <div className="ml-3">
        <label
          htmlFor={checkboxId}
          className={`text-sm font-medium ${error ? 'text-red-700' : 'text-gray-700'}`}
        >
          {label}
        </label>
        {description && (
          <p id={`${checkboxId}-desc`} className="text-sm text-gray-500">
            {description}
          </p>
        )}
        {error && (
          <p id={errorId} className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

interface RadioGroupProps {
  label?: string;
  error?: string;
  name: string;
  children: React.ReactNode;
  required?: boolean;
}

export function RadioGroup({
  label,
  error,
  name,
  children,
  required = false
}: RadioGroupProps): React.ReactElement {
  const groupId = useReactId();
  const errorId = `${groupId}-error`;

  return (
    <div role="radiogroup" aria-labelledby={label ? groupId : undefined} aria-invalid={!!error} aria-describedby={error ? errorId : undefined}>
      {label && (
        <legend id={groupId} className={`text-sm font-medium mb-2 ${error ? 'text-red-700' : 'text-gray-700'}`}>
          {label}
          {required && <span className="text-red-500 ml-1" aria-label="required">*</span>}
        </legend>
      )}
      <div className="space-y-2">
        {React.Children.map(children, (child, index) => {
          if (React.isValidElement(child)) {
            return React.cloneElement(child as React.ReactElement, {
              name,
              id: `${groupId}-${index}`
            });
          }
          return child;
        })}
      </div>
      {error && (
        <p id={errorId} className="mt-1 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

interface RadioButtonProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  description?: string;
  value: string;
}

export function RadioButton({
  label,
  description,
  value,
  id,
  className = '',
  ...props
}: RadioButtonProps): React.ReactElement {
  const generatedId = useReactId();
  const radioId = id || generatedId;

  return (
    <div className="flex items-start">
      <div className="flex items-center h-5">
        <input
          id={radioId}
          type="radio"
          value={value}
          className={`h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500 ${className}`.trim()}
          {...props}
        />
      </div>
      <div className="ml-3">
        <label htmlFor={radioId} className="text-sm font-medium text-gray-700">
          {label}
        </label>
        {description && (
          <p className="text-sm text-gray-500">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'aria-invalid'> {
  label?: string;
  error?: string;
  helperText?: string;
  fullWidth?: boolean;
  required?: boolean;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
}

export function Select({
  label,
  error,
  helperText,
  fullWidth = false,
  required = false,
  options,
  id,
  className = '',
  ...props
}: SelectProps): React.ReactElement {
  const generatedId = useReactId();
  const selectId = id || generatedId;
  const errorId = `${selectId}-error`;
  const helperId = `${selectId}-helper`;

  const hasError = !!error;

  return (
    <div className={fullWidth ? 'w-full' : ''}>
      {label && (
        <label
          htmlFor={selectId}
          className={`block text-sm font-medium mb-1 ${hasError ? 'text-red-700' : 'text-gray-700'}`}
        >
          {label}
          {required && <span className="text-red-500 ml-1" aria-label="required">*</span>}
        </label>
      )}
      <select
        id={selectId}
        className={`block px-3 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500 ${
          hasError ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : ''
        } ${fullWidth ? 'w-full' : ''} ${className}`.trim()}
        aria-invalid={hasError}
        aria-describedby={hasError ? errorId : helperText ? helperId : undefined}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      {hasError && (
        <p id={errorId} className="mt-1 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      {helperText && !hasError && (
        <p id={helperId} className="mt-1 text-sm text-gray-500">
          {helperText}
        </p>
      )}
    </div>
  );
}

interface TextAreaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'aria-invalid'> {
  label?: string;
  error?: string;
  helperText?: string;
  fullWidth?: boolean;
  required?: boolean;
  resize?: 'none' | 'both' | 'horizontal' | 'vertical';
}

export function TextArea({
  label,
  error,
  helperText,
  fullWidth = false,
  required = false,
  resize = 'vertical',
  id,
  className = '',
  ...props
}: TextAreaProps): React.ReactElement {
  const generatedId = useReactId();
  const textareaId = id || generatedId;
  const errorId = `${textareaId}-error`;
  const helperId = `${textareaId}-helper`;

  const hasError = !!error;

  const resizeClasses = {
    none: 'resize-none',
    both: 'resize',
    horizontal: 'resize-x',
    vertical: 'resize-y'
  };

  return (
    <div className={fullWidth ? 'w-full' : ''}>
      {label && (
        <label
          htmlFor={textareaId}
          className={`block text-sm font-medium mb-1 ${hasError ? 'text-red-700' : 'text-gray-700'}`}
        >
          {label}
          {required && <span className="text-red-500 ml-1" aria-label="required">*</span>}
        </label>
      )}
      <textarea
        id={textareaId}
        className={`block px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500 ${
          hasError ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : ''
        } ${fullWidth ? 'w-full' : ''} ${resizeClasses[resize]} ${className}`.trim()}
        aria-invalid={hasError}
        aria-describedby={hasError ? errorId : helperText ? helperId : undefined}
        {...props}
      />
      {hasError && (
        <p id={errorId} className="mt-1 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      {helperText && !hasError && (
        <p id={helperId} className="mt-1 text-sm text-gray-500">
          {helperText}
        </p>
      )}
    </div>
  );
}

interface SearchInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'aria-invalid'> {
  label?: string;
  onClear?: () => void;
  fullWidth?: boolean;
}

export function SearchInput({
  label = 'Search',
  onClear,
  fullWidth = false,
  value,
  onChange,
  className = '',
  ...props
}: SearchInputProps): React.ReactElement {
  const hasValue = !!value;
  const inputId = useReactId();

  return (
    <div className={`relative ${fullWidth ? 'w-full' : ''}`}>
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none" aria-hidden="true">
          <svg
            className="h-5 w-5 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
        <input
          id={inputId}
          type="search"
          value={value}
          onChange={onChange}
          className={`block pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500 ${fullWidth ? 'w-full' : ''} ${className}`.trim()}
          {...props}
        />
        {hasValue && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none"
            aria-label="Clear search"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

export default {
  Input,
  Checkbox,
  RadioGroup,
  RadioButton,
  Select,
  TextArea,
  SearchInput
};
