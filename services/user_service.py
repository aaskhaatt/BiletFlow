from schemas.user import UserCreate, UserLogin
from sqlalchemy.orm import Session
from repositories.user_repository import create_user, get_user_by_email
from exceptions import UserAlreadyExistsError, UserNotFoundError, InvalidCredentialsError


def hash_password(password):
    return password

def verify_password(password, password_hash):
    return password == password_hash


def register_user_service(user: UserCreate, db: Session):
    try:
        get_user_by_email(user.email, db)

    except UserNotFoundError:
        password_hash = hash_password(user.password)
        return create_user(user.email, password_hash, db)


    raise UserAlreadyExistsError()



def authenticate_user_service(user: UserLogin, db: Session):
    try:
        authenticated_user = get_user_by_email(user.email, db)

    except UserNotFoundError:
        raise InvalidCredentialsError()
    

    if not verify_password(user.password, authenticated_user.password_hash):
        raise InvalidCredentialsError()

        
    return authenticated_user
    
    