
""""
54 cards including the two jokes
4 players
each player is given a random amount of cards divided between all of them
they start with either 13 or 14 cards the player with 14 cards start
three rounds
points awarded each round 
tycoon gets 20
rich gets 10
poor gets 5
beggar gets 0
after the round the deck is shuffled and randomized
the deck is shuffled initially and randomized before dealt our
cards have a hierarcy of 3,4,5,6,7,8,9,10,J,Q,K,A,2,J
if a joker is played and another player has a 3 they can play it and it ends the turn
4 of a kind starts a revolution meaning cards have reversed strenth (can implimenmt at a later time)


round 1 
cards are distributed
randomized to see who goes first (preference to the players with 14 cards) 
turn player plays one card to four cards all of the same value
next player must play the same number of cards with a higher value
if the player cannot play a value higher or doesnt want to they can pass their turn
turn ends when the three players all pass turn and all cards are added to the discard pile (to be reshuffled in the next round)
next turn continues the action and the round ends when all cards are played
the player who gets rid of all there cards first is the tycoon 2nd place is rich 3rd place is poor and 4th place is the beggar
points are awarded based on the placement of the player

rounds 2 and 3
cards are randomly distrubted 
beggar MUST give two of the BEST cards to the tycoon and the tycoon MUST give any two cards to the beggar 
poor MUST give there best card to the rich and the rich MUST give one card to the poor
beggar goes first and then moves in clockwise action
turns continue as normal
if the tycoon does not become the tycoon again they are instantly a beggar and they are out of the round
points are added to the placement of the player

end of game
person with the most points after 3 rounds wins the game and becomes the tycoon!
"""

class Deck:
    def __init__(self, suit,value):
        self.suit = suit
        self.value = value
        
    cardValue = [3,4,5,6,7,8,9,10,'J','Q','K',2,'Joker']
    
class User:
    def __init__(self, name, points, status):
        self.name = name
        self.points = points
        self.status = status
        

