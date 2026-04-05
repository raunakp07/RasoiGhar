let user = JSON.parse(localStorage.getItem("user"));

pname.value = user.name;
pemail.value = user.email;

function updateProfile() {
  user.name = pname.value;
  user.email = pemail.value;

  localStorage.setItem("user", JSON.stringify(user));
  alert("Profile Updated!");
}
