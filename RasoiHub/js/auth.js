function signup() {
  localStorage.setItem(
    "user",
    JSON.stringify({
      name: name.value,
      email: email.value,
      password: password.value
    })
  );
  alert("Signup Successful");
  window.location.href = "login.html";
}

function login() {
  let user = JSON.parse(localStorage.getItem("user"));

  if (
    loginEmail.value === user.email &&
    loginPassword.value === user.password
  ) {
    window.location.href = "dashboard.html";
  } else {
    alert("Invalid Login");
  }
}
