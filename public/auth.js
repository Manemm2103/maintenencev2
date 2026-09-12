
(function(){
  const AUTH_KEY = 'drhome_demo_auth';
  const protectedPage = !location.pathname.endsWith('/login.html') && !location.pathname.endsWith('login.html');

  function isLoggedIn(){
    return localStorage.getItem(AUTH_KEY) === '1';
  }
  window.drhomeLogout = function(){
    localStorage.removeItem(AUTH_KEY);
    location.href = 'login.html';
  };
  window.drhomeLogin = function(email, password){
    // Prototype only. Real authentication must be verified by the backend.
    if ((email || '').trim().length >= 3 && (password || '').length >= 4){
      localStorage.setItem(AUTH_KEY, '1');
      localStorage.setItem('drhome_demo_email', (email || '').trim());
      location.href = 'index.html';
      return true;
    }
    return false;
  };

  if (protectedPage && !isLoggedIn()){
    location.replace('login.html');
  }
  if (!protectedPage && isLoggedIn()){
    location.replace('index.html');
  }
})();
