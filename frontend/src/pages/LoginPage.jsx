import React, { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { styles } from '../styles';
import { ApiError } from '../lib/api';

export default function LoginPage() {
  const { login } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(password);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('ログインに失敗しました。通信環境をご確認ください。');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.loginWrap}>
      <div style={styles.loginCard}>
        <div style={styles.loginMark}>馬</div>
        <div style={styles.loginTitle}>競走馬スコアリング</div>
        <div style={styles.loginSub}>独自採点 馬券分析台帳</div>
        <form onSubmit={submit}>
          <label style={styles.fieldLabel}>パスワード</label>
          <input
            type="password"
            style={styles.input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            placeholder="••••••••"
          />
          {error && <div style={styles.errorText}>{error}</div>}
          <button type="submit" style={{ ...styles.primaryBtn, width: '100%', marginTop: 20 }} disabled={loading}>
            {loading ? '確認中…' : 'ログイン'}
          </button>
        </form>
      </div>
    </div>
  );
}
