let bookings = JSON.parse(localStorage.getItem("bookings")) || [];

document.getElementById("totalBookings").innerText = bookings.length;

let guests = bookings.reduce((sum, b) => sum + Number(b.guests), 0);
document.getElementById("totalGuests").innerText = guests;

if (bookings.length > 0) {
  document.getElementById("upcoming").innerText =
    bookings[0].restaurant + " - " + bookings[0].date;
}

function logout() {
  window.location.href = "index.html";
}
