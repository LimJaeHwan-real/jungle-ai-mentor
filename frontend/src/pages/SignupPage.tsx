import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { getErrorMessage } from '../api';
import { useAuth } from '../state/AuthContext';

export function SignupPage() {
  const navigate = useNavigate();
  const { signup } = useAuth();
  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await signup(email, password, nickname);
      navigate('/');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="form-panel narrow">
      <h2>회원가입</h2>
      <form onSubmit={onSubmit} className="stack-form">
        <label>
          이메일
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
        </label>
        <label>
          닉네임
          <input value={nickname} onChange={(event) => setNickname(event.target.value)} minLength={2} required />
        </label>
        <label>
          비밀번호
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" minLength={8} required />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button className="primary-button" type="submit" disabled={isSubmitting}>
          <UserPlus size={17} /> {isSubmitting ? '가입 중' : '회원가입'}
        </button>
      </form>
      <p className="muted-line">
        이미 계정이 있다면 <Link to="/login">로그인</Link>
      </p>
    </section>
  );
}

