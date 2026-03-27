import { CredentialsSignin } from 'next-auth';

export class MissingCredentialsError extends CredentialsSignin {
  code = 'missing_credentials';
}

export class InvalidCredentialsError extends CredentialsSignin {
  code = 'invalid_credentials';
}

export class ExistingUserError extends CredentialsSignin {
  code = 'user_exists';
}

export function getCredentialsAuthErrorMessage(error?: string | null, code?: string | null) {
  if (code === 'user_exists') {
    return '这个邮箱已经注册过了';
  }

  if (code === 'missing_credentials') {
    return '请输入邮箱和密码';
  }

  if (code === 'invalid_credentials' || code === 'credentials' || error === 'CredentialsSignin') {
    return '邮箱或密码不正确';
  }

  if (error === 'Configuration') {
    return '认证暂时不可用，请稍后重试';
  }

  return null;
}
