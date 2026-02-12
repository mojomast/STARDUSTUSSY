import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from '../../store';
import Layout from '../../components/Layout';

describe('Layout', () => {
  it('renders logo and navigation', () => {
    render(
      <Provider store={store}>
        <Layout><div>Test Content</div></Layout>
      </Provider>
    );
    
    expect(screen.getByText('SyncBridge')).toBeInTheDocument();
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });
});
