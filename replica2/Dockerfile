FROM node:18

WORKDIR /app

COPY package*.json ./

RUN npm install && npm install -g nodemon

COPY . .

EXPOSE 5002

CMD ["nodemon", "--legacy-watch", "server.js"]
